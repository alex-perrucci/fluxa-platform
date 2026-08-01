import type { SVGProps } from 'react';

export function FluxaMark({ className, ...props }: SVGProps<SVGSVGElement>) {
  const classes = ['fluxa-mark', className].filter(Boolean).join(' ');

  return (
    <svg
      aria-hidden="true"
      className={classes}
      fill="none"
      viewBox="0 0 128 128"
      {...props}
    >
      <path d="M20 16H104L79 45H20Z" fill="currentColor" />
      <path d="M20 51H77L60 72H20Z" fill="currentColor" />
      <path d="M20 77H52L20 108Z" fill="#D6A84B" />
    </svg>
  );
}