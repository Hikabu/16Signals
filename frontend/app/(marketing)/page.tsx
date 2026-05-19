"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion, useScroll, useTransform, useInView } from "framer-motion";
import { ArrowRight, Check, Shield, Eye, Zap, Github } from "lucide-react";

import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

// Premium easing
const ease = [0.16, 1, 0.3, 1] as const;

// ============================================================================
// HERO - Premium Apple-like with subtle ambient glow
// ============================================================================

function HeroSection() {
  const containerRef = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: containerRef,
    offset: ["start start", "end start"],
  });

  const opacity = useTransform(scrollYProgress, [0, 0.5], [1, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], [1, 0.95]);
  const y = useTransform(scrollYProgress, [0, 0.5], [0, 100]);

  return (
    <section
      ref={containerRef}
      className="relative flex min-h-[calc(100svh-56px)] items-center justify-center overflow-hidden"
    >
      {/* Premium ambient background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute left-1/2 top-1/3 h-[600px] w-[800px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary/10 blur-[120px]" />
        <div className="absolute left-1/4 top-1/2 h-[400px] w-[400px] -translate-x-1/2 rounded-full bg-primary/5 blur-[100px]" />
        <div className="absolute right-1/4 top-1/3 h-[300px] w-[300px] translate-x-1/2 rounded-full bg-primary/5 blur-[80px]" />
      </div>

      {/* Subtle grain texture */}
      <div
        className="pointer-events-none absolute inset-0 opacity-[0.015]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E\")",
        }}
      />

      <motion.div
        style={{ opacity, scale, y }}
        className="relative z-10 mx-auto max-w-4xl px-6 text-center"
      >
        {/* Logo with glow */}
        <motion.div
          initial={{ opacity: 0, scale: 0.8 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 1, delay: 0.2, ease }}
          className="relative mx-auto mb-10 w-fit"
        >
          <div className="absolute inset-0 scale-150 rounded-full bg-primary/20 blur-2xl" />
          <Image
            src="/logo.png"
            alt="16signals"
            width={56}
            height={56}
            priority
            className="relative"
          />
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.4, ease }}
          className="text-3xl font-semibold tracking-tight sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Resumes describe developers.
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.55, ease }}
          className="mt-2 bg-gradient-to-r from-primary via-primary to-primary/70 bg-clip-text text-3xl font-semibold tracking-tight text-transparent sm:text-5xl md:text-6xl lg:text-7xl"
        >
          Signals reveal them.
        </motion.p>

        {/* Subheadline */}
        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.7, ease }}
          className="mx-auto mt-6 max-w-xl text-base text-muted-foreground sm:text-lg md:text-xl"
        >
          Engineering intelligence extracted from years of verified technical
          work. 16 dimensions of evidence, zero guesswork.
        </motion.p>

        {/* CTA — dual path: connect GitHub OR explore as guest */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.85, ease }}
          className="mt-10 flex flex-col items-stretch justify-center gap-3 px-0 sm:flex-row sm:items-center sm:px-0"
        >
          {/* Primary: Connect GitHub (candidate sign-up) */}
          <Button
            size="lg"
            className="h-13 gap-2.5 px-8 text-base w-full sm:w-auto"
            asChild
          >
            <Link href={routes.auth}>
              <Github className="size-5" />
              Connect GitHub
            </Link>
          </Button>

          {/* Secondary: Explore without signing in */}
          <Button
            variant="outline"
            size="lg"
            className="h-13 px-8 text-base w-full sm:w-auto"
            asChild
          >
            <Link href={routes.browse}>
              Explore talent
              <ArrowRight className="ml-2 size-4" />
            </Link>
          </Button>
        </motion.div>

        {/* Trust indicators — wrap on mobile */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 1.2, ease }}
          className="mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-xs text-muted-foreground/60 sm:text-sm"
        >
          <span>Read-only access</span>
          <span className="hidden sm:inline size-1 rounded-full bg-muted-foreground/30" />
          <span>Free for developers</span>
          <span className="hidden sm:inline size-1 rounded-full bg-muted-foreground/30" />
          <span>No spam, ever</span>
        </motion.div>
      </motion.div>

      {/* Scroll indicator */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 2, duration: 1 }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <motion.div
          animate={{ y: [0, 8, 0] }}
          transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
          className="flex flex-col items-center gap-2"
        >
          <span className="text-xs text-muted-foreground/50">Scroll</span>
          <div className="h-8 w-px bg-gradient-to-b from-muted-foreground/30 to-transparent" />
        </motion.div>
      </motion.div>
    </section>
  );
}

// ============================================================================
// ANIMATED SECTION WRAPPER - Cinematic reveal on scroll
// ============================================================================

function Section({
  children,
  className = "",
  id,
}: {
  children: React.ReactNode;
  className?: string;
  id?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-40% 0px -40% 0px" });

  return (
    <section
      ref={ref}
      id={id}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.div
        initial={{ opacity: 0, y: 60 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1, ease }}
      >
        {children}
      </motion.div>
    </section>
  );
}

// ============================================================================
// PROBLEM SECTION
// ============================================================================

function ProblemSection() {
  return (
    <Section className="py-32 md:py-40">
      <div className="mx-auto max-w-3xl px-6 text-center">
        <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
          The Problem
        </p>

        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Resumes are optimized for keywords,
          <br />
          <span className="text-muted-foreground">not capability.</span>
        </h2>

        <p className="mx-auto mt-8 max-w-xl text-lg text-muted-foreground">
          Generic claims. AI-generated fluff. No way to verify depth. Technical
          hiring has become expensive guesswork.
        </p>
      </div>
    </Section>
  );
}

// ============================================================================
// SIGNAL DIMENSIONS - Elegant grid instead of horizontal bars
// ============================================================================

const signalCategories = [
  {
    title: "Ownership",
    signals: [
      "Repository leadership",
      "Maintainer status",
      "Decision authority",
      "Long-term stewardship",
    ],
    gradient: "from-primary/20 to-primary/5",
  },
  {
    title: "Depth",
    signals: [
      "Architectural impact",
      "System design",
      "Complex problem solving",
      "Technical breadth",
    ],
    gradient: "from-primary/15 to-primary/5",
  },
  {
    title: "Influence",
    signals: [
      "Cross-team collaboration",
      "Review authority",
      "Mentorship patterns",
      "Community standing",
    ],
    gradient: "from-primary/10 to-transparent",
  },
  {
    title: "Consistency",
    signals: [
      "Contribution patterns",
      "Quality over time",
      "Growth trajectory",
      "Sustained engagement",
    ],
    gradient: "from-primary/10 to-transparent",
  },
];

function SignalsSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30%" });

  return (
    <section ref={ref} id="signals" className="overflow-hidden py-32 md:py-40">
      <div className="mx-auto max-w-6xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-16 text-center md:mb-20"
        >
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-primary">
            The Solution
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            16 dimensions of engineering evidence.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
            We analyze years of verified work to extract what actually matters:
            ownership, depth, influence, and consistency.
          </p>
        </motion.div>

        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {signalCategories.map((category, idx) => (
            <motion.div
              key={category.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2 + idx * 0.1, ease }}
              className="group relative"
            >
              <div
                className={`absolute inset-0 rounded-2xl bg-gradient-to-b ${category.gradient} opacity-0 transition-opacity duration-500 group-hover:opacity-100`}
              />
              <div className="relative rounded-2xl border border-border/30 bg-card/30 p-6 transition-colors duration-500 group-hover:border-primary/20">
                <h3 className="mb-4 text-lg font-medium">{category.title}</h3>
                <ul className="space-y-2.5">
                  {category.signals.map((signal) => (
                    <li
                      key={signal}
                      className="flex items-center gap-2.5 text-sm text-muted-foreground"
                    >
                      <div className="size-1 rounded-full bg-primary/50" />
                      {signal}
                    </li>
                  ))}
                </ul>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// HOW IT WORKS - Clean numbered steps
// ============================================================================

const steps = [
  {
    title: "Connect GitHub",
    description:
      "One-click authorization with read-only access to your public activity.",
  },
  {
    title: "Extract Signals",
    description:
      "Our engine analyzes commits, PRs, reviews, and ownership patterns.",
  },
  {
    title: "Generate Profile",
    description:
      "Receive a verified engineering identity with quantified evidence.",
  },
  {
    title: "Get Discovered",
    description: "Match with teams that evaluate capability, not keywords.",
  },
];

function HowItWorksSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30%" });

  return (
    <section
      ref={ref}
      id="how-it-works"
      className="overflow-hidden py-32 md:py-40"
    >
      <div className="mx-auto max-w-5xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-16 text-center md:mb-20"
        >
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            How it works
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Four steps to verified capability.
          </h2>
        </motion.div>

        <div className="grid gap-12 md:grid-cols-2 lg:grid-cols-4 lg:gap-8">
          {steps.map((step, idx) => (
            <motion.div
              key={step.title}
              initial={{ opacity: 0, y: 40 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.3 + idx * 0.12, ease }}
              className="relative"
            >
              {/* Connector line */}
              {idx < steps.length - 1 && (
                <div className="absolute left-full top-6 hidden h-px w-full bg-gradient-to-r from-border to-transparent lg:block" />
              )}

              <div className="mb-4 font-mono text-5xl font-light text-primary/20">
                {String(idx + 1).padStart(2, "0")}
              </div>
              <h3 className="mb-2 text-lg font-medium">{step.title}</h3>
              <p className="text-sm text-muted-foreground">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// COMPARISON - Claims vs Evidence
// ============================================================================

function ComparisonSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30%" });

  const claims = [
    "5+ years of experience",
    "Strong communicator",
    "Team player",
    "Fast learner",
    "Passionate about tech",
  ];

  const signals = [
    "Primary maintainer: 3 production systems",
    "87% review approval across 400+ PRs",
    "Infrastructure ownership: 2 organizations",
    "Cross-team architectural influence",
    "18-month sustained contribution pattern",
  ];

  return (
    <section ref={ref} className="overflow-hidden py-32 md:py-40">
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-16 text-center md:mb-20"
        >
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Evidence vs Claims
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            From words to proof.
          </h2>
        </motion.div>

        <div className="grid gap-6 md:grid-cols-2">
          {/* Claims */}
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.3, ease }}
            className="rounded-2xl border border-border/20 bg-muted/5 p-8"
          >
            <p className="mb-8 text-xs font-medium uppercase tracking-[0.2em] text-muted-foreground/60">
              Traditional Resume
            </p>
            <div className="space-y-5">
              {claims.map((claim, idx) => (
                <div
                  key={idx}
                  className="flex items-center gap-4 text-muted-foreground/70"
                >
                  <div className="size-1.5 rounded-full bg-muted-foreground/20" />
                  <span>{claim}</span>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Signals */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={isInView ? { opacity: 1, x: 0 } : {}}
            transition={{ duration: 0.8, delay: 0.4, ease }}
            className="relative overflow-hidden rounded-2xl border border-primary/20 bg-gradient-to-b from-primary/10 to-primary/5 p-8"
          >
            <div className="absolute -right-20 -top-20 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
            <p className="relative mb-8 text-xs font-medium uppercase tracking-[0.2em] text-primary">
              16signals Profile
            </p>
            <div className="relative space-y-5">
              {signals.map((signal, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, x: 20 }}
                  animate={isInView ? { opacity: 1, x: 0 } : {}}
                  transition={{ duration: 0.6, delay: 0.5 + idx * 0.08, ease }}
                  className="flex items-center gap-4"
                >
                  <div className="flex size-5 items-center justify-center rounded-full bg-primary/20">
                    <Check className="size-3 text-primary" />
                  </div>
                  <span>{signal}</span>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// TRUST & NO GHOST JOBS - Combined section
// ============================================================================

const trustFeatures = [
  {
    icon: Shield,
    title: "No ghost jobs",
    description:
      "Every opportunity verified. Real budget, real timeline, real hiring intent.",
  },
  {
    icon: Eye,
    title: "Full transparency",
    description: "See exactly what signals are extracted and how they're used.",
  },
  {
    icon: Zap,
    title: "Instant analysis",
    description: "Complete profile generation in under 5 minutes.",
  },
];

function TrustSection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30%" });

  return (
    <section
      ref={ref}
      id="no-ghost-jobs"
      className="overflow-hidden py-32 md:py-40"
    >
      <div className="mx-auto max-w-4xl px-6">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 1, ease }}
          className="mb-16 text-center md:mb-20"
        >
          <p className="mb-6 font-mono text-xs uppercase tracking-[0.25em] text-muted-foreground">
            Built for developers
          </p>
          <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
            Your time matters.
          </h2>
          <p className="mx-auto mt-6 max-w-xl text-muted-foreground">
            Read-only GitHub access. No spam. No fake listings. Just verified
            opportunities from teams actually hiring.
          </p>
        </motion.div>

        <div className="grid gap-8 md:grid-cols-3">
          {trustFeatures.map((item, idx) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 30 }}
              animate={isInView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.8, delay: 0.2 + idx * 0.1, ease }}
              className="rounded-2xl border border-border/30 bg-card/30 p-6"
            >
              <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                <item.icon className="size-5 text-primary" />
              </div>
              <h3 className="mb-2 font-medium">{item.title}</h3>
              <p className="text-sm text-muted-foreground">
                {item.description}
              </p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ============================================================================
// CTA
// ============================================================================

function CTASection() {
  const ref = useRef<HTMLDivElement>(null);
  const isInView = useInView(ref, { once: true, margin: "-30%" });

  return (
    <section ref={ref} className="relative overflow-hidden py-32 md:py-40">
      {/* Background gradient */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute bottom-0 left-1/2 h-[500px] w-[800px] -translate-x-1/2 translate-y-1/2 rounded-full bg-primary/10 blur-[100px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={isInView ? { opacity: 1, y: 0 } : {}}
        transition={{ duration: 1, ease }}
        className="relative mx-auto max-w-2xl px-6 text-center"
      >
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl md:text-5xl">
          Your code already tells your story.
        </h2>

        <p className="mx-auto mt-6 max-w-md text-lg text-muted-foreground">
          Connect your GitHub and let your work speak for itself.
        </p>

        <div className="mt-12">
          <Button size="lg" className="h-13 gap-2.5 px-8 text-base" asChild>
            <Link href={routes.auth}>
              <Github className="size-5" />
              Connect GitHub
            </Link>
          </Button>
        </div>

        <p className="mt-6 text-sm text-muted-foreground/60">
          Free for developers. Always.
        </p>
      </motion.div>
    </section>
  );
}

// ============================================================================
// FOOTER
// ============================================================================

function Footer() {
  return (
    <footer className="relative z-10 bg-black py-6">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-6">
        <div className="flex items-center gap-2">
          <Image
            src="/logo.png"
            alt="16signals"
            width={16}
            height={16}
            className="opacity-60"
          />
          <span className="text-xs text-muted-foreground/60">
            2024 16signals
          </span>
        </div>

        <div className="flex items-center gap-6 text-xs text-muted-foreground/60">
          <Link
            href="#"
            className="transition-colors hover:text-muted-foreground"
          >
            Privacy
          </Link>
          <Link
            href="#"
            className="transition-colors hover:text-muted-foreground"
          >
            Terms
          </Link>
        </div>
      </div>
    </footer>
  );
}

// ============================================================================
// PAGE
// ============================================================================

export default function LandingPage() {
  return (
    <main className="relative overflow-x-hidden bg-background">
      {/* Nav is rendered globally by AppNav in the root layout */}
      <HeroSection />
      <ProblemSection />
      <SignalsSection />
      <HowItWorksSection />
      <ComparisonSection />
      <TrustSection />
      <CTASection />
      <Footer />
    </main>
  );
}
