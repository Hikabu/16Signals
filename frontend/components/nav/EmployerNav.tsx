"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import {
  Avatar,
  AvatarFallback,
} from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { LogOut, Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuthStore } from "@/lib/auth-store";
import { useLogout } from "@/lib/hooks/useLogout";
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { SheetTitle } from "@/components/ui/sheet"

interface EmployerNavProps {
  companyName: string;
  onLogout?: () => void;
}

const NAV_LINKS = [
  { label: "Post a Job", href: "/hr/jobs/new" },
  { label: "My Listings", href: "/hr/jobs/new?tab=my-jobs" },
] as const;

function getInitials(name: string): string {
  return name
    .split(/\s+/)
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export function EmployerNav({ companyName, onLogout }: EmployerNavProps) {
  const pathname = usePathname();
  const doLogout = useLogout();
  const [open, setOpen] = useState(false);

  // Close sheet on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) => pathname === href;

  const handleLogout = () => {
    if (onLogout) {
      onLogout();
    } else {
      doLogout();
    }
  };

  const initials = getInitials(companyName);

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-full flex items-center gap-4">
        {/* Logo, amber dot for employer accent */}
        <Link
          href="/hr/jobs/new"
          className="flex items-center gap-2 shrink-0"
        >
          <Image
            src="/logo-transparent.png"
            alt="16signals"
            width={28}
            height={28}
            className="h-7 w-7 object-contain"
          />
          <span className="font-mono font-bold text-sm tracking-tight text-foreground">
            16signals
          </span>
        </Link>

        {/* Center nav links, desktop only */}
        <nav className="hidden md:flex items-center gap-1 ml-4">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={cn(
                "text-sm font-medium transition-colors px-3 py-1.5 rounded-md",
                isActive(link.href)
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              {link.label}
            </Link>
          ))}
        </nav>

        {/* Spacer */}
        <div className="flex-1" />

        {/* Avatar dropdown, desktop, amber accent */}
        <div className="hidden md:flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                className="h-8 w-8 rounded-full p-0 focus-visible:ring-1 focus-visible:ring-amber-400/50"
              >
                <Avatar className="h-8 w-8">
                  <AvatarFallback className="bg-amber-400/15 text-amber-400 text-xs font-mono font-semibold">
                    {initials}
                  </AvatarFallback>
                </Avatar>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-44">
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="text-destructive focus:text-destructive flex items-center gap-2 cursor-pointer"
                onClick={handleLogout}
              >
                <LogOut className="h-4 w-4" />
                Log out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button variant="ghost" size="icon" className="md:hidden">
              <Menu className="h-5 w-5" />
              <span className="sr-only">Toggle menu</span>
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-72 flex flex-col gap-6 pt-10">
            <VisuallyHidden>
    <SheetTitle>Employer Nav</SheetTitle>
  </VisuallyHidden>
            {/* Company identity */}
            <div className="flex items-center gap-3 px-3">
              <Avatar className="h-9 w-9">
                <AvatarFallback className="bg-amber-400/15 text-amber-400 text-xs font-mono font-semibold">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-sm font-mono font-medium text-foreground truncate">
                {companyName}
              </span>
            </div>

            {/* Nav links */}
            <nav className="flex flex-col gap-1">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "text-sm font-medium transition-colors px-3 py-2.5 rounded-md",
                    isActive(link.href)
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Bottom actions */}
            <div className="flex flex-col gap-1 mt-auto border-t border-border pt-4">
              <button
                onClick={handleLogout}
                className="flex items-center gap-2 text-sm font-medium text-destructive hover:text-destructive/80 transition-colors px-3 py-2.5 rounded-md hover:bg-destructive/10 text-left"
              >
                <LogOut className="h-4 w-4" />
                Log out
              </button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
