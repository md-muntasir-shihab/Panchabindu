import { Link } from 'wouter';
import { useLocaleStore } from '@/store/use-locale-store';

export default function NotFound() {
  const locale = useLocaleStore(s => s.locale);
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-lg bg-surface border border-border flex items-center justify-center mb-4">
        <span className="text-xl font-bold text-muted font-mono">404</span>
      </div>
      <h1 className="text-2xl font-bold text-ink mb-2">
        {locale === 'bn' ? 'পৃষ্ঠাটি খুঁজে পাওয়া যায়নি' : 'Page not found'}
      </h1>
      <p className="text-sm text-muted max-w-md mb-6">
        {locale === 'bn'
          ? 'আপনি যে লিংকটি অনুসন্ধান করছেন তা হয়তো স্থানান্তরিত হয়েছে অথবা আর বিদ্যমান নেই।'
          : 'The link you followed may have been moved or no longer exists.'}
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-md bg-accent text-white text-sm font-medium hover:bg-accent-hover transition-colors shadow-sm min-h-[44px]"
      >
        {locale === 'bn' ? 'হোমপেজে ফিরে যান' : 'Back to homepage'}
      </Link>
    </div>
  );
}
