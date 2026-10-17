export function Brand({ className = "" }: { className?: string }) {
  return <svg className={className} viewBox="0 0 40 40" fill="none" aria-hidden="true"><g fill="currentColor">
    <path d="M20 19C5 19 5 3 13 5c7 1 7 10 7 14Z" />
    <path d="M21 20c0-15 16-15 14-7-1 7-10 7-14 7Z" />
    <path d="M20 21c15 0 15 16 7 14-7-1-7-10-7-14Z" />
    <path d="M19 20c0 15-16 15-14 7 1-7 10-7 14-7Z" />
  </g></svg>;
}
