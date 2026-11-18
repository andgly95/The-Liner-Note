"use client";

export function RetryButton() {
  return (
    <button
      onClick={() => window.location.reload()}
      className="rounded-full bg-primary text-primary-foreground px-4 py-2 text-sm font-medium"
    >
      Try again
    </button>
  );
}
