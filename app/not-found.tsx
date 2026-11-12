// app/not-found.tsx
import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="min-h-[70vh] flex flex-col items-center justify-center px-4 text-center">
      <div className="w-16 h-16 rounded-full bg-amber-50 border border-amber-200 flex items-center justify-center mb-4">
        <span className="text-2xl font-bold text-amber-700">404</span>
      </div>
      <h1 className="text-2xl font-bold text-gray-900 mb-2">পৃষ্ঠাটি খুঁজে পাওয়া যায়নি</h1>
      <p className="text-sm text-gray-600 max-w-md mb-6">
        আপনি যে লিংকটি অনুসন্ধান করছেন তা হয়তো স্থানান্তরিত হয়েছে অথবা আর বিদ্যমান নেই।
      </p>
      <Link
        href="/"
        className="inline-flex items-center gap-2 px-5 py-2.5 rounded-lg bg-emerald-800 text-white text-sm font-medium hover:bg-emerald-900 transition-colors shadow-sm"
      >
        হোমপেজে ফিরে যান
      </Link>
    </div>
  );
}
