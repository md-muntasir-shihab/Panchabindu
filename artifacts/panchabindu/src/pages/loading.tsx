import { useLocaleStore } from '@/store/use-locale-store';

export default function LoadingPage() {
  const locale = useLocaleStore(s => s.locale);
  return (
    <main aria-busy="true" className="min-h-screen flex items-center justify-center bg-[#FAF9F5] px-6 text-[#162119]">
      <div className="flex flex-col items-center gap-5 text-center" role="status" aria-live="polite">
        <div className="panchabindu-loader" aria-hidden="true"><span /><span /><span /><span /><span /></div>
        <div><p className="font-semibold tracking-wide">পঞ্চবিন্দু <span className="text-sm font-normal">/ Panchabindu</span></p>
          <p className="mt-1 text-sm text-[#5A655D]">{locale === 'bn' ? 'একটু অপেক্ষা করুন…' : 'Please wait a moment…'}</p></div>
      </div>
    </main>
  );
}
