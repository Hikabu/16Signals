import { Suspense } from "react";
import ProfileClient from "./ProfileClient";

//use: CANDIDATES
//TODO: UPDATE 

export default function Page() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfileClient />
    </Suspense>
  );
}