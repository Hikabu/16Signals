"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetTrigger,
} from "@/components/ui/sheet";
import { Menu } from "lucide-react";
import { cn } from "@/lib/utils";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";
import { VisuallyHidden } from '@radix-ui/react-visually-hidden'
import { SheetTitle } from "@/components/ui/sheet"

const NAV_LINKS = [
  { label: "Browse Jobs", href: "/browse" },
  { label: "Find Talent", href: "/browse?tab=people" },
] as const;

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  const [mounted, setMounted] = useState(false)

useEffect(() => {
  setMounted(true)
}, [])

  // Close sheet on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

const currentUrl = mounted
  ? pathname + window.location.search
  : pathname;

const isActive = (href: string) => {
  if (href === "/browse") {
    return currentUrl === "/browse";
  }

  return currentUrl === href;
};

  return (
    <header className="sticky top-0 z-40 h-14 border-b border-border bg-background/80 backdrop-blur-md">
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-full flex items-center gap-4">
        {/* Logo */}
        <Link
          href="/"
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

        {/* Auth + Wallet, desktop */}
        <div className="hidden md:flex items-center gap-2">
          <div className="hidden md:flex items-center gap-2">
  {mounted && <WalletMultiButton />}
</div>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/auth">Sign in</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href="/auth">Get started</Link>
          </Button>
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
    <SheetTitle>Public Nav</SheetTitle>
  </VisuallyHidden>
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
            <div className="flex flex-col gap-2 mt-auto">
{mounted && <WalletMultiButton />}
              <Button variant="ghost" size="sm" asChild>
                <Link href="/auth">Sign in</Link>
              </Button>
              <Button variant="default" size="sm" asChild>
                <Link href="/auth">Get started</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
