import { useState } from 'preact/hooks';

import { hostnameOf } from '../../lib/url.js';

/**
 * Site favicon for the card top-left, fetched via Google's s2 service.
 * On error (CSP-restricted page, no favicon, network down) the img
 * disappears and we render a neutral circle in its place.
 */
export function Favicon({ sourceUrl }: { sourceUrl: string }) {
  const [errored, setErrored] = useState(false);
  if (errored) {
    return (
      <span className="inline-block h-6 w-6 flex-shrink-0 rounded-full border border-stone-300 bg-stone-100 dark:border-stone-700 dark:bg-stone-800" />
    );
  }
  const host = hostnameOf(sourceUrl);
  const src = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=64`;
  return (
    <img
      src={src}
      alt=""
      width={24}
      height={24}
      className="h-6 w-6 flex-shrink-0 rounded-full bg-white object-contain p-0.5 shadow-sm ring-1 ring-stone-200 dark:bg-stone-100 dark:ring-stone-700"
      onError={() => {
        setErrored(true);
      }}
    />
  );
}
