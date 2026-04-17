import Script from 'next/script';
import type { ReactNode } from 'react';

export default function LandingLayout({ children }: { children: ReactNode }) {
  const clarityId = process.env.NEXT_PUBLIC_CLARITY_PROJECT_ID;
  return (
    <>
      {children}
      {clarityId && (
        <Script
          id="ms-clarity"
          strategy="afterInteractive"
          dangerouslySetInnerHTML={{
            __html: `(function(c,l,a,r,i,t,y){c[a]=c[a]||function(){(c[a].q=c[a].q||[]).push(arguments)};t=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);})(window, document, "clarity", "script", "${clarityId}");`,
          }}
        />
      )}
    </>
  );
}
