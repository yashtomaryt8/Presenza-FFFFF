import React from 'react';

// ── cn utility ────────────────────────────────────────────────────
export function cn(...classes) {
  return classes.filter(Boolean).join(' ');
}

// ── Button ────────────────────────────────────────────────────────
const btnBase = 'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50';

const btnVariants = {
  default:     'bg-foreground text-background hover:bg-foreground/90',
  outline:     'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
  secondary:   'bg-secondary text-secondary-foreground hover:bg-secondary/80',
  ghost:       'hover:bg-accent hover:text-accent-foreground',
  destructive: 'bg-destructive/10 text-destructive border border-destructive/20 hover:bg-destructive/20',
  link:        'text-primary underline-offset-4 hover:underline',
};

const btnSizes = {
  default: 'h-9 px-4 py-2',
  sm:      'h-7 rounded-md px-3 text-xs',
  lg:      'h-11 rounded-md px-8',
  icon:    'h-9 w-9',
};

export function Button({ variant = 'default', size = 'default', className = '', children, ...props }) {
  return (
    <button
      className={cn(btnBase, btnVariants[variant], btnSizes[size], className)}
      {...props}
    >
      {children}
    </button>
  );
}

// ── Card ──────────────────────────────────────────────────────────
export function Card({ className = '', children, ...props }) {
  return (
    <div className={cn('rounded-xl border border-border bg-card text-card-foreground', className)} {...props}>
      {children}
    </div>
  );
}
export function CardHeader({ className = '', children }) {
  return <div className={cn('flex items-center justify-between px-4 py-3 border-b border-border', className)}>{children}</div>;
}
export function CardTitle({ className = '', children }) {
  return <p className={cn('text-sm font-semibold', className)}>{children}</p>;
}
export function CardBody({ className = '', children }) {
  return <div className={cn('p-4', className)}>{children}</div>;
}

// ── Badge ─────────────────────────────────────────────────────────
const badgeVariants = {
  default:     'border-transparent bg-primary text-primary-foreground',
  secondary:   'border-transparent bg-secondary text-secondary-foreground',
  outline:     'text-foreground border-border',
  green:       'border-green-200 bg-green-50 text-green-700 dark:border-green-800 dark:bg-green-950 dark:text-green-300',
  yellow:      'border-yellow-200 bg-yellow-50 text-yellow-700 dark:border-yellow-800 dark:bg-yellow-950 dark:text-yellow-300',
  red:         'border-red-200 bg-red-50 text-red-700 dark:border-red-800 dark:bg-red-950 dark:text-red-300',
  blue:        'border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300',
};

export function Badge({ variant = 'default', className = '', children }) {
  return (
    <span className={cn('inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold transition-colors uppercase tracking-wide', badgeVariants[variant], className)}>
      {children}
    </span>
  );
}

// ── Input ─────────────────────────────────────────────────────────
export function Input({ label, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <input
        className={cn('flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50', className)}
        {...props}
      />
    </div>
  );
}

export function Select({ label, className = '', children, ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <select
        className={cn('flex h-9 w-full rounded-md border border-input bg-background px-3 py-1 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50', className)}
        {...props}
      >
        {children}
      </select>
    </div>
  );
}

export function Textarea({ label, className = '', ...props }) {
  return (
    <div className="flex flex-col gap-1.5">
      {label && <label className="text-xs font-medium text-muted-foreground">{label}</label>}
      <textarea
        className={cn('flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 resize-none', className)}
        {...props}
      />
    </div>
  );
}

// ── Spinner ───────────────────────────────────────────────────────
export function Spinner({ size = 16, className = '' }) {
  return (
    <svg
      width={size} height={size} viewBox="0 0 24 24"
      fill="none" stroke="currentColor" strokeWidth="2"
      className={cn('animate-spin', className)}
    >
      <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
    </svg>
  );
}

// ── Empty ─────────────────────────────────────────────────────────
export function Empty({ icon, title, sub, action, onAction }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-2">
      {icon && <div className="text-2xl opacity-30 mb-1">{icon}</div>}
      <p className="text-sm text-muted-foreground font-medium">{title}</p>
      {sub && <p className="text-xs text-muted-foreground/70">{sub}</p>}
      {action && (
        <button onClick={onAction} className="mt-2 text-xs text-foreground underline-offset-4 hover:underline flex items-center gap-1">
          + {action}
        </button>
      )}
    </div>
  );
}

// ── Toggle ────────────────────────────────────────────────────────
export function Toggle({ value, options, onChange, className = '' }) {
  return (
    <div className={cn('inline-flex h-9 items-center justify-center rounded-md bg-muted p-1 text-muted-foreground', className)}>
      {options.map(o => (
        <button
          key={o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-xs font-medium transition-all',
            value === o.value
              ? 'bg-background text-foreground shadow-sm'
              : 'hover:text-foreground/80'
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

// ── Stat Card ─────────────────────────────────────────────────────
export function StatCard({ icon, label, value, sub }) {
  return (
    <div className="border border-border rounded-xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">
        {icon && <span className="text-sm">{icon}</span>}
        <span className="text-[11px]">{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
      {sub && <p className="text-[11px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

// ── Separator ────────────────────────────────────────────────────
export function Separator({ className = '' }) {
  return <div className={cn('h-px w-full bg-border', className)} />;
}

// ── Section header ────────────────────────────────────────────────
export function SectionHeader({ title, action, onAction, href }) {
  return (
    <div className="flex items-center justify-between mb-3">
      <h2 className="text-sm font-semibold">{title}</h2>
      {(action || href) && (
        <button onClick={onAction} className="text-[11px] text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
          {action} →
        </button>
      )}
    </div>
  );
}

// ── Alert / Toast ─────────────────────────────────────────────────
export function Alert({ variant = 'default', className = '', children }) {
  const styles = {
    default:     'bg-secondary text-secondary-foreground border-border',
    success:     'bg-green-50 text-green-800 border-green-200 dark:bg-green-950 dark:text-green-200 dark:border-green-800',
    error:       'bg-red-50 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-200 dark:border-red-800',
    warning:     'bg-yellow-50 text-yellow-800 border-yellow-200 dark:bg-yellow-950 dark:text-yellow-200 dark:border-yellow-800',
    info:        'bg-blue-50 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-200 dark:border-blue-800',
  };
  return (
    <div className={cn('flex items-start gap-2.5 rounded-lg border px-3.5 py-3 text-sm animate-fade', styles[variant], className)}>
      {children}
    </div>
  );
}
