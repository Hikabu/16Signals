"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import * as z from "zod";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROLE_TYPES } from "../_lib/wizard-utils";
import type { Step1JobForm } from "../_lib/wizard-types";

const schema = z
  .object({
    title: z.string().min(3).max(200),
    description: z.string().min(50),
    responsibilities: z.string().min(10),
    requirements: z.string().min(10),
    salaryMin: z.union([z.literal(""), z.coerce.number().min(0)]),
    salaryMax: z.union([z.literal(""), z.coerce.number().min(0)]),
    location: z.string().min(1),
    employmentType: z.string().min(1),
    bonusAmount: z.coerce.number().min(0),
    roleType: z.string().optional(),
    currency: z.string().min(1),
  })
  .superRefine((data, ctx) => {
    if (data.salaryMin === "" || data.salaryMax === "") {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Salary minimum and maximum are required.",
        path: ["salaryMin"],
      });
      return;
    }
    if (data.salaryMax < data.salaryMin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Maximum salary must be greater than or equal to minimum.",
        path: ["salaryMax"],
      });
    }
  });

export type StepDtoFormValues = z.infer<typeof schema>;

const defaults: StepDtoFormValues = {
  title: "",
  description: "",
  responsibilities: "",
  requirements: "",
  salaryMin: "",
  salaryMax: "",
  location: "Remote",
  employmentType: "Full-time",
  bonusAmount: 0,
  roleType: "",
  currency: "USDT",
};

function toStep1(v: StepDtoFormValues): Step1JobForm {
  return {
    title: v.title,
    description: v.description,
    responsibilities: v.responsibilities,
    requirements: v.requirements,
    salaryMin: v.salaryMin,
    salaryMax: v.salaryMax,
    location: v.location,
    employmentType: v.employmentType,
    bonusAmount: v.bonusAmount,
    roleType: v.roleType ?? "",
    currency: v.currency,
  };
}

function parseNumericInput(raw: string): number | "" {
  const trimmed = raw.replace(/[^\d]/g, "");
  if (!trimmed) return "";
  const normalized = trimmed.replace(/^0+(?=\d)/, "");
  const n = Number(normalized);
  return Number.isFinite(n) ? n : "";
}

export function StepDtoForm(props: {
  initial?: Partial<Step1JobForm>;
  onNext: (data: Step1JobForm) => void | Promise<void>;
}) {
  const form = useForm<StepDtoFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      ...defaults,
      ...props.initial,
      roleType: props.initial?.roleType ?? "",
    },
  });

  return (
    <Form {...form}>
      <form
        className="mx-auto w-full max-w-4xl space-y-8"
        onSubmit={form.handleSubmit(async (v) => {
          await props.onNext(toStep1(v));
        })}
      >
        <div className="space-y-2">
          <h2 className="text-lg font-semibold">Job details</h2>
          <p className="text-sm text-muted-foreground">
            Enter the listing exactly as you want it structured. Nothing is sent
            to the server until the AI review step.
          </p>
        </div>

        <FormField
          control={form.control}
          name="title"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Title</FormLabel>
              <FormControl>
                <Input placeholder="e.g. Senior backend engineer" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="roleType"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Role type</FormLabel>
              <Select
                onValueChange={(val) =>
                  field.onChange(val === "__none__" ? "" : val)
                }
                value={field.value ? field.value : "__none__"}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Optional, helps scoring" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="__none__">Not specified</SelectItem>
                  {ROLE_TYPES.map((r) => (
                    <SelectItem key={r} value={r}>
                      {r.replace(/_/g, " ")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormDescription>Optional, maps to backend role scoring.</FormDescription>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="location"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Location</FormLabel>
                <FormControl>
                  <Input placeholder="Remote, NYC, …" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="employmentType"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Employment type</FormLabel>
                <FormControl>
                  <Input placeholder="Full-time, contract…" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="salaryMin"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary minimum (USD)</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={field.value === "" ? "" : String(field.value)}
                    onFocus={() => {
                      if (field.value === 0) field.onChange("");
                    }}
                    onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="salaryMax"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Salary maximum (USD)</FormLabel>
                <FormControl>
                  <Input
                    inputMode="numeric"
                    pattern="[0-9]*"
                    value={field.value === "" ? "" : String(field.value)}
                    onFocus={() => {
                      if (field.value === 0) field.onChange("");
                    }}
                    onChange={(e) => field.onChange(parseNumericInput(e.target.value))}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <div className="grid gap-6 md:grid-cols-2">
          <FormField
            control={form.control}
            name="bonusAmount"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Bonus pool (USDT)</FormLabel>
                <FormControl>
                  <Input type="number" min={0} step="1" {...field} />
                </FormControl>
                <FormDescription>
                  Planning bonus separate from optional escrow funding later.
                </FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="currency"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Currency</FormLabel>
                <FormControl>
                  <Input {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        <FormField
          control={form.control}
          name="description"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Description</FormLabel>
              <FormControl>
                <Textarea
                  className="min-h-[300px] resize-y text-base leading-relaxed"
                  placeholder="Company, team, mission, stack, and why this role matters."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="responsibilities"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Responsibilities</FormLabel>
              <FormControl>
                <Textarea
                  className="min-h-[140px] resize-y"
                  placeholder="Ownership areas, milestones, collaboration."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name="requirements"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Requirements</FormLabel>
              <FormControl>
                <Textarea
                  className="min-h-[140px] resize-y"
                  placeholder="Must-have skills and experience."
                  {...field}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <div className="flex justify-end">
          <Button type="submit" size="lg" className="min-w-[140px]">
            Next, AI review
          </Button>
        </div>
      </form>
    </Form>
  );
}
