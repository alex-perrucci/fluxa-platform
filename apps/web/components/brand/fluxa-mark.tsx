// PHASE_8_TRUE_CONTROL_CENTER
import type { SVGProps } from 'react';

export function FluxaMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 48 48"
      {...props}
    >
      <defs>
        <linearGradient id="fluxa-a" x1="6" x2="42" y1="7" y2="42">
          <stop stopColor="#8B5CF6" />
          <stop offset=".52" stopColor="#4F7CFF" />
          <stop offset="1" stopColor="#22D3EE" />
        </linearGradient>
      </defs>
      <path
        d="M12.2 7.5h24.1c3.7 0 5.8 4.2 3.6 7.2L27.7 31.4a4.5 4.5 0 0 1-7.3 0L8.5 14.7c-2.2-3 .1-7.2 3.7-7.2Z"
        fill="url(#fluxa-a)"
      />
      <path d="M24 14.5 31.5 25H16.7L24 14.5Z" fill="white" fillOpacity=".94" />
      <path
        d="M16 37.8h16"
        stroke="url(#fluxa-a)"
        strokeLinecap="round"
        strokeWidth="4"
      />
    </svg>
  );
}
