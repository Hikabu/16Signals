"use client"

import * as React from "react"

import { cn } from "@/lib/utils"

interface DashboardShellProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

export function DashboardShell({
  children,
  className,
  ...props
}: DashboardShellProps) {
  return (
    <div
      className={cn("flex flex-1 flex-col gap-4 p-4 md:gap-6 md:p-6", className)}
      {...props}
    >
      {children}
    </div>
  )
}

interface DashboardHeaderProps extends React.HTMLAttributes<HTMLDivElement> {
  heading: string
  description?: string
  children?: React.ReactNode
}

export function DashboardHeader({
  heading,
  description,
  children,
  className,
  ...props
}: DashboardHeaderProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 md:flex-row md:items-center md:justify-between",
        className
      )}
      {...props}
    >
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-balance">
          {heading}
        </h1>
        {description && (
          <p className="text-sm text-muted-foreground text-pretty">
            {description}
          </p>
        )}
      </div>
      {children && (
        <div className="flex items-center gap-2 pt-2 md:pt-0">{children}</div>
      )}
    </div>
  )
}

interface DashboardSectionProps extends React.HTMLAttributes<HTMLElement> {
  children: React.ReactNode
}

export function DashboardSection({
  children,
  className,
  ...props
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-4", className)} {...props}>
      {children}
    </section>
  )
}

interface DashboardGridProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
  columns?: 1 | 2 | 3 | 4
}

export function DashboardGrid({
  children,
  columns = 4,
  className,
  ...props
}: DashboardGridProps) {
  const gridCols = {
    1: "grid-cols-1",
    2: "grid-cols-1 md:grid-cols-2",
    3: "grid-cols-1 md:grid-cols-2 lg:grid-cols-3",
    4: "grid-cols-1 md:grid-cols-2 lg:grid-cols-4",
  }

  return (
    <div className={cn("grid gap-4", gridCols[columns], className)} {...props}>
      {children}
    </div>
  )
}
