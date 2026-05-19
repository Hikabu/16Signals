import {
  JobsController_createJobPost,
  JobsController_parseJd,
  apiFetch,
  unwrapApiSuccessData,
  type JobsController_createRequest,
  type JobsController_parseJdRequest,
} from "@/lib/api";
import type { ParseJdData } from "./wizard-types";
import type { components } from "@/src/api/schema";

type CreateBody = components["schemas"]["CreateJobDto"] & {
  roleType?: import("./wizard-types").JobRoleType;
};

export async function replaceDraftJob(args: {
  previousId: string | null;
  payload: CreateBody;
  jdText: string;
}): Promise<{ jobId: string; parse: ParseJdData }> {
  let jobId = args.previousId ?? null;

  if (jobId) {
    await apiFetch(`/jobs/${encodeURIComponent(jobId)}`, {
      method: "PATCH",
      body: args.payload,
    });
  } else {
    const createdRaw = await JobsController_createJobPost({
      body: args.payload,
    } as JobsController_createRequest);

    const created = unwrapApiSuccessData<{ id?: string }>(createdRaw);
    jobId = created?.id ?? null;
    if (!jobId) {
      throw new Error("Job created but no id was returned.");
    }
  }

  const parseRaw = await JobsController_parseJd({
    path: { id: jobId },
    body: { jdText: args.jdText },
  } as JobsController_parseJdRequest);

  const parse = unwrapApiSuccessData<ParseJdData>(parseRaw);
  return { jobId, parse };
}
