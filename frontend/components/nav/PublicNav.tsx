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
import { VisuallyHidden } from "@radix-ui/react-visually-hidden";
import { SheetTitle } from "@/components/ui/sheet";

const NAV_LINKS = [
  { label: "Browse Jobs", href: "/browse" },
  { label: "Find Talent", href: "/browse?tab=people" },
] as const;

export function PublicNav() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Scroll-based glass effect: transparent at top on landing page, frosted everywhere/always on scroll
  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 20);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  // Close mobile sheet on route change
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const currentUrl = mounted
    ? pathname + window.location.search
    : pathname;

  const isActive = (href: string) => {
    if (href === "/browse") return currentUrl === "/browse";
    return currentUrl === href;
  };

  // On the landing page start transparent; everywhere else always frosted
  const isLanding = pathname === "/";
  const frosted = !isLanding || scrolled;

  return (
    <header
      className={cn(
        "sticky top-0 z-50 h-14 transition-all duration-500",
        frosted
          ? "border-b border-border/60 bg-background/80 backdrop-blur-xl"
          : "border-b border-transparent bg-transparent"
      )}
    >
      <div className="max-w-screen-xl mx-auto px-4 sm:px-6 h-full flex items-center gap-4">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2 shrink-0">
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

        {/* Desktop nav links */}
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

        {/* Desktop: Wallet + Sign in + Explore */}
        <div className="hidden md:flex items-center gap-2">
          {mounted && <WalletMultiButton />}
          <Button variant="ghost" size="sm" asChild>
            <Link href="/auth">Sign in</Link>
          </Button>
          <Button variant="default" size="sm" asChild>
            <Link href="/browse">Explore</Link>
          </Button>
        </div>

        {/* Mobile hamburger */}
        <Sheet open={open} onOpenChange={setOpen}>
          <SheetTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden h-10 w-10 shrink-0"
              aria-label="Open menu"
            >
              <Menu className="h-5 w-5" />
            </Button>
          </SheetTrigger>

          <SheetContent side="right" className="w-[280px] flex flex-col gap-0 p-0">
            <VisuallyHidden>
              <SheetTitle>Navigation menu</SheetTitle>
            </VisuallyHidden>

            {/* Sheet header */}
            <div className="flex items-center gap-2 px-5 h-14 border-b border-border shrink-0">
              <Image
                src="/logo-transparent.png"
                alt="16signals"
                width={22}
                height={22}
                className="h-[22px] w-[22px] object-contain"
              />
              <span className="font-mono font-bold text-sm tracking-tight">16signals</span>
            </div>

            {/* Nav links — large touch targets */}
            <nav className="flex flex-col gap-0.5 px-3 pt-3">
              {NAV_LINKS.map((link) => (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    "flex items-center text-sm font-medium transition-colors px-3 rounded-lg",
                    "min-h-[48px]", // minimum touch target
                    isActive(link.href)
                      ? "text-foreground bg-accent"
                      : "text-muted-foreground hover:text-foreground hover:bg-accent"
                  )}
                >
                  {link.label}
                </Link>
              ))}
            </nav>

            {/* Solana wallet (mobile) */}
            {mounted && (
              <div className="px-3 pt-2">
                <WalletMultiButton />
              </div>
            )}

            {/* Bottom CTAs — full width, clear dual path */}
            <div className="mt-auto px-3 pb-6 pt-4 border-t border-border flex flex-col gap-2">
              <Button asChild className="w-full h-12 text-sm font-medium">
                <Link href="/auth">Sign in / Connect GitHub</Link>
              </Button>
              <Button variant="outline" asChild className="w-full h-12 text-sm font-medium">
                <Link href="/browse">Explore as guest</Link>
              </Button>
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </header>
  );
}
