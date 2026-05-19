import { Suspense } from "react";
import BrowseClient from "./BrowseClient";

//use: ALL 
// (only talent part @1st)
//TODO: UPDATE talent & conditional non rendering of jobs

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <BrowseClient />
    </Suspense>
  );
}