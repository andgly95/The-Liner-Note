import { Suspense } from "react";
import { Shell } from "@/components/social/shell";
import { SearchPage } from "@/components/social/search-page";

export const metadata = { title: "Search · The Liner Note" };

export default function Page() {
  // bare: the screen's own row (back + field) is its header on a phone.
  return (
    <Shell bare>
      <Suspense>
        <SearchPage />
      </Suspense>
    </Shell>
  );
}
