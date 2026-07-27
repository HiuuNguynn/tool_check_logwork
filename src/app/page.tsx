import { Suspense } from "react";

import { ReportApp } from "@/components/ReportApp";

export default function Home() {
  return (
    <Suspense fallback={null}>
      <ReportApp />
    </Suspense>
  );
}
