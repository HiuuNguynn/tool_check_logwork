import { Suspense } from "react";

import { PmView } from "@/components/PmView";

export default function PmPage() {
  return (
    <Suspense fallback={null}>
      <PmView />
    </Suspense>
  );
}
