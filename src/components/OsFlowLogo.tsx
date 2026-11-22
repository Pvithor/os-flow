export function OsFlowLogo({ className = 'h-9 w-9' }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden="true"
    >
      <rect x="2" y="2" width="36" height="36" rx="7" fill="#181c23" stroke="#3c494e" strokeWidth="1.5" />
      <path d="M9 13H23L27 17V30" stroke="#00d4ff" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M9 20H18L21 23V30" stroke="#6af7ba" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="11" cy="27" r="3" fill="#00d4ff" />
      <circle cx="29" cy="11" r="2.75" fill="#6af7ba" />
      <path d="M29 11L32 8" stroke="#6af7ba" strokeWidth="1.75" strokeLinecap="round" />
    </svg>
  );
}
