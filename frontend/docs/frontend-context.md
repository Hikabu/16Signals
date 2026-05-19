# 16signals, FRONTEND CONTEXT

## Product Overview

Colosseum is an evidence-based hiring platform for developers.

The platform replaces CV claims with verifiable proof-of-work derived from:
- GitHub activity
- Open source contributions
- Technical ownership
- Consistency over time
- Stack usage
- Web3 on-chain activity
- Reputation/vouch systems

The platform focuses on:
- reducing hiring noise
- reducing ghost jobs
- improving interview quality
- improving candidate matching
- increasing recruiter confidence
- surfacing real technical ability

The product is NOT:
- a social network
- a portfolio website
- a crypto casino UI
- a generic ATS dashboard
- a developer analytics toy

The product SHOULD feel like:
- a technical intelligence platform
- a recruiter decision system
- a trusted hiring layer
- a modern evidence engine

---

# Core Product Thesis

Traditional CVs are claims.
Colosseum is evidence.

The frontend should communicate:
- trust
- technical credibility
- clarity
- precision
- objectivity
- high signal over noise

Every UI decision should reinforce:
"This platform surfaces real developer capability."

---

# UX Philosophy

## Primary Goal

Reduce recruiter cognitive load.

Recruiters should:
- scan quickly
- identify strong candidates rapidly
- understand confidence instantly
- compare applicants efficiently
- trust the surfaced signals

Candidates should:
- feel fairly represented
- understand strengths and weaknesses
- trust the analysis process
- feel technically respected

---

# UI Personality

The interface should feel:
- calm
- analytical
- structured
- intelligent
- technical
- premium
- recruiter-efficient

Avoid:
- flashy gradients
- excessive animations
- gamification
- loud crypto aesthetics
- cluttered dashboards
- cartoonish visuals

---

# Design References

The product should visually feel inspired by:
- Linear
- Stripe Dashboard
- GitHub
- Vercel
- Raycast
- Notion Dark Mode
- Ashby
- Ramp

NOT:
- neon cyberpunk dashboards
- meme crypto products
- dribbble-style concept UIs
- overanimated startup landing pages

---

# Visual Principles

## General

- Dark-first interface
- Strong spacing consistency
- High typography hierarchy
- Dense but readable layouts
- Minimal visual noise
- Structured information grouping
- Clear hierarchy between primary and secondary information
- Subtle surfaces and borders

## Layout

- Use cards for grouped information
- Use large spacing between major sections
- Use smaller spacing within grouped sections
- Avoid full-width unreadable tables
- Prioritize scanability

## Motion

- Minimal animations
- Motion should support clarity
- No decorative motion
- Subtle transitions only

---

# Information Hierarchy

## Priority Order

### Primary
- Summary
- Capabilities
- Confidence
- Fit indicators

### Secondary
- Ownership
- Impact
- Stack fingerprint
- Reputation

### Tertiary
- Metadata
- Raw metrics
- Historical events
- Supporting evidence

---

# Frontend Tech Stack

## Core
- Next.js App Router
- TypeScript
- Tailwind CSS
- shadcn/ui

## State + Data
- TanStack Query
- Zustand
- React Hook Form
- Zod

## API
- OpenAPI-generated client
- Typed DTOs
- Typed responses

## Motion
- Framer Motion (minimal usage)

---

# Frontend Engineering Rules

## Architecture

- Feature-based architecture
- Shared reusable UI components
- Strong typing everywhere
- No direct fetch calls inside pages
- All API requests go through service layer

## Components

- Prefer composition over giant components
- Reusable cards
- Reusable metric components
- Reusable loading states
- Reusable empty states

## Styling

- Use Tailwind only
- No inline styles
- No random spacing values
- Follow spacing scale strictly

## State

- Server state = TanStack Query
- Local UI state = Zustand or component state
- Forms = React Hook Form + Zod

---

# Product Modes

## Candidate Side

Candidate flows:
- auth
- onboarding
- github sync
- wallet sync
- scorecard generation
- profile management
- vouch system
- applications
- gap analysis

## Recruiter Side

Recruiter flows:
- job creation
- job publishing
- candidate review
- ranking
- pipeline management
- application review
- scorecard analysis
- interview preparation

---

# Critical Product Screens

## Most Important Screen

Recruiter candidate profile card.

This is the product identity screen.

It should communicate:
- trust
- clarity
- evidence
- technical capability
- recruiter efficiency

Everything else derives from this screen.

---

# Accessibility

- Strong contrast ratios
- Keyboard navigable
- Focus states visible
- Readable typography
- Clear loading/error states
- Mobile responsive

---

# Performance Goals

- Fast initial render
- Optimistic UI where appropriate
- Minimal layout shift
- Skeleton loading states
- Efficient caching
- Smooth recruiter workflows

---

# Frontend Success Criteria

The frontend succeeds if:
- recruiters can evaluate candidates rapidly
- candidates trust the analysis
- flows feel professional and trustworthy
- the UI feels technically credible
- the interface reduces noise instead of adding it
