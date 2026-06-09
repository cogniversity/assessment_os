type LogoProps = {
  className?: string;
  showText?: boolean;
};

export function Logo({ className = "h-8 w-auto", showText = false }: LogoProps) {
  return (
    <span className="inline-flex items-center gap-2">
      <img src="/assessment_os_logo.png" alt="Assessment OS" className={className} />
      {showText && <span className="font-semibold text-indigo-600">Assessment OS</span>}
    </span>
  );
}
