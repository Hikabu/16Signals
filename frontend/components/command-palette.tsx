"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import {
  BarChart3,
  Briefcase,
  Building2,
  FileText,
  GitBranch,
  LayoutDashboard,
  Moon,
  Search,
  Settings,
  Sun,
  User,
  Users,
} from "lucide-react"

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
  CommandShortcut,
} from "@/components/ui/command"

interface CommandPaletteProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  const router = useRouter()

  const runCommand = React.useCallback(
    (command: () => void) => {
      onOpenChange(false)
      command()
    },
    [onOpenChange]
  )

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput placeholder="Search candidates, jobs, or commands..." />
      <CommandList>
        <CommandEmpty>No results found.</CommandEmpty>

        <CommandGroup heading="Quick Actions">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/candidates/new"))}
          >
            <Users className="mr-2 size-4" />
            <span>Add Candidate</span>
            <CommandShortcut>⌘N</CommandShortcut>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/jobs/new"))}
          >
            <Briefcase className="mr-2 size-4" />
            <span>Create Job</span>
            <CommandShortcut>⌘J</CommandShortcut>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => {})}>
            <Search className="mr-2 size-4" />
            <span>Search GitHub Profile</span>
            <CommandShortcut>⌘G</CommandShortcut>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Navigation">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/dashboard"))}
          >
            <LayoutDashboard className="mr-2 size-4" />
            <span>Dashboard</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/candidates"))}
          >
            <Users className="mr-2 size-4" />
            <span>Candidates</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => router.push("/jobs"))}>
            <Briefcase className="mr-2 size-4" />
            <span>Jobs</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/pipeline"))}
          >
            <GitBranch className="mr-2 size-4" />
            <span>Pipeline</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/analytics"))}
          >
            <BarChart3 className="mr-2 size-4" />
            <span>Analytics</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Settings">
          <CommandItem
            onSelect={() => runCommand(() => router.push("/organization"))}
          >
            <Building2 className="mr-2 size-4" />
            <span>Organization</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/settings"))}
          >
            <Settings className="mr-2 size-4" />
            <span>Settings</span>
          </CommandItem>
          <CommandItem
            onSelect={() => runCommand(() => router.push("/profile"))}
          >
            <User className="mr-2 size-4" />
            <span>Profile</span>
          </CommandItem>
        </CommandGroup>

        <CommandSeparator />

        <CommandGroup heading="Theme">
          <CommandItem onSelect={() => runCommand(() => {})}>
            <Sun className="mr-2 size-4" />
            <span>Light Mode</span>
          </CommandItem>
          <CommandItem onSelect={() => runCommand(() => {})}>
            <Moon className="mr-2 size-4" />
            <span>Dark Mode</span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
