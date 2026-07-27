#!/usr/bin/env node

import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith('--')) continue;
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) {
      args[key] = 'true';
      continue;
    }
    args[key] = next;
    i += 1;
  }
  return args;
}

function sanitizeFileName(value) {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
}

function collectUrls(text) {
  const urls = new Set();
  const patterns = [
    /!\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g,
    /\[[^\]]*]\((https?:\/\/[^)\s]+)\)/g,
    /(?:^|\s)(https?:\/\/[^\s<>"')\]]+)/g,
    /^\[[^\]]+]:\s*(https?:\/\/\S+)/gm,
  ];

  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const candidate = (match[1] || '').trim().replace(/[),.;]+$/, '');
      if (candidate) urls.add(candidate);
    }
  }

  return [...urls];
}

function extensionFromContentType(contentType) {
  const normalized = (contentType || '').toLowerCase();
  if (normalized.includes('image/jpeg')) return '.jpg';
  if (normalized.includes('image/png')) return '.png';
  if (normalized.includes('image/gif')) return '.gif';
  if (normalized.includes('image/webp')) return '.webp';
  if (normalized.includes('image/svg+xml')) return '.svg';
  if (normalized.includes('image/bmp')) return '.bmp';
  if (normalized.includes('image/tiff')) return '.tiff';
  return '';
}

function isLikelyImageUrl(url) {
  return /\.(png|jpg|jpeg|gif|webp|svg|bmp|tiff)(\?.*)?$/i.test(url);
}

function decodeHtmlEntities(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

function extractMetaImageUrl(html) {
  const patterns = [
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["'][^>]*>/i,
    /<meta[^>]+name=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["'][^>]*>/i,
    /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image(?::src)?["'][^>]*>/i,
    /<link[^>]+rel=["']image_src["'][^>]+href=["']([^"']+)["'][^>]*>/i,
    /<link[^>]+href=["']([^"']+)["'][^>]+rel=["']image_src["'][^>]*>/i,
  ];

  for (const pattern of patterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      return decodeHtmlEntities(match[1].trim());
    }
  }

  return null;
}

async function resolveImageUrl(url) {
  const response = await fetch(url, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
    headers: {
      'user-agent': 'IPP backlog image crawler',
    },
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (contentType.toLowerCase().includes('image/') || isLikelyImageUrl(response.url)) {
    return {
      mode: 'direct',
      response,
      sourcePageUrl: url,
      resolvedImageUrl: response.url,
    };
  }

  if (!contentType.toLowerCase().includes('text/html')) {
    throw new Error(`Unsupported content-type: ${contentType || 'unknown'}`);
  }

  const html = await response.text();
  const extractedImageUrl = extractMetaImageUrl(html);
  if (!extractedImageUrl) {
    throw new Error(`Could not extract image from HTML page: ${response.url}`);
  }

  const resolvedImageUrl = new URL(extractedImageUrl, response.url).toString();
  const imageResponse = await fetch(resolvedImageUrl, {
    redirect: 'follow',
    signal: AbortSignal.timeout(30000),
    headers: {
      'user-agent': 'IPP backlog image crawler',
      referer: response.url,
    },
  });

  if (!imageResponse.ok) {
    throw new Error(`Image fetch failed: HTTP ${imageResponse.status}`);
  }

  const imageContentType = imageResponse.headers.get('content-type') || '';
  if (!imageContentType.toLowerCase().includes('image/') && !isLikelyImageUrl(imageResponse.url)) {
    throw new Error(`Resolved asset is not an image: ${imageContentType || 'unknown'}`);
  }

  return {
    mode: 'page',
    response: imageResponse,
    sourcePageUrl: response.url,
    resolvedImageUrl: imageResponse.url,
  };
}

async function downloadImage(url, targetDir, index) {
  const { response, sourcePageUrl, resolvedImageUrl, mode } = await resolveImageUrl(url);
  const contentType = response.headers.get('content-type') || '';
  const urlObject = new URL(resolvedImageUrl);
  const originalBase = sanitizeFileName(path.basename(urlObject.pathname) || `image-${index}`);
  const ext = path.extname(originalBase) || extensionFromContentType(contentType) || '.img';
  const baseName = path.basename(originalBase, path.extname(originalBase)) || `image-${index}`;
  const fileName = `${String(index).padStart(3, '0')}-${baseName}${ext}`;
  const filePath = path.join(targetDir, fileName);
  const arrayBuffer = await response.arrayBuffer();
  const buffer = Buffer.from(arrayBuffer);

  await writeFile(filePath, buffer);

  return {
    sourceUrl: url,
    sourcePageUrl,
    resolvedImageUrl,
    fileName,
    filePath,
    contentType: contentType || 'unknown',
    size: buffer.length,
    status: 'downloaded',
    mode,
  };
}

async function ensurePlaceholder(filePath, content) {
  try {
    await stat(filePath);
  } catch {
    await writeFile(filePath, content);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const issueKey = args['issue-key'];
  if (!issueKey) {
    throw new Error('Missing required argument: --issue-key');
  }

  const rootDir = path.resolve(args.root || '.claude/docs/backlog-impact');
  const issueDir = path.join(rootDir, issueKey);
  const imagesDir = path.join(issueDir, 'images');
  const reportPath = path.join(issueDir, 'report.md');

  await mkdir(issueDir, { recursive: true });
  await mkdir(imagesDir, { recursive: true });
  await rm(path.join(issueDir, 'ticket-info'), { recursive: true, force: true });
  await rm(path.join(imagesDir, 'README.md'), { force: true });
  await rm(path.join(imagesDir, 'manifest.json'), { force: true });

  const sourceMd = args['source-md'] ? path.resolve(args['source-md']) : null;
  const reportMd = args['report-md'] ? path.resolve(args['report-md']) : null;

  let ticketContent = '';
  if (sourceMd) {
    ticketContent = await readFile(sourceMd, 'utf8');
  } else {
    ticketContent = '';
  }

  if (reportMd) {
    await rename(reportMd, reportPath);
  } else {
    await ensurePlaceholder(
      reportPath,
      `# ${issueKey} - Backlog Impact Analysis\n\nReport has not been generated yet.\n`,
    );
  }

  const urls = ticketContent ? collectUrls(ticketContent) : [];
  const downloaded = [];
  const skipped = [];

  for (const url of urls) {
    try {
      const item = await downloadImage(url, imagesDir, downloaded.length + 1);
      downloaded.push(item);
    } catch (error) {
      skipped.push({
        sourceUrl: url,
        reason: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  process.stdout.write(
    JSON.stringify(
      {
        issueKey,
        issueDir,
        reportPath,
        imagesDir,
        downloaded: downloaded.map((item) => ({
          sourceUrl: item.sourceUrl,
          resolvedImageUrl: item.resolvedImageUrl,
          relativePath: path.posix.join('images', item.fileName),
          contentType: item.contentType,
          size: item.size,
          mode: item.mode,
        })),
        skipped,
        downloadedCount: downloaded.length,
        skippedCount: skipped.length,
      },
      null,
      2,
    ) + '\n',
  );
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
