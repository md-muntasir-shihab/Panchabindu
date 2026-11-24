import { Button, Card } from '@/components/ui/primitives';
import { useLocaleStore } from '@/store/use-locale-store';

export default function ErrorPage({ reset }: { reset: () => void }) {
  const locale = useLocaleStore(s => s.locale);
  return (
    <main className="min-h-screen bg-bg px-4 py-16 text-ink">
      <Card className="mx-auto max-w-lg space-y-4">
        <h1 className="text-xl font-bold">
          {locale === 'bn' ? 'এই মুহূর্তে তথ্য লোড করা যাচ্ছে না' : 'Could not load this page right now'}
        </h1>
        <p role="alert" className="text-sm text-muted">
          {locale === 'bn'
            ? 'কিছুক্ষণ পর আবার চেষ্টা করুন। সমস্যা চলতে থাকলে সহায়তার জন্য যোগাযোগ করুন।'
            : 'Please try again in a moment. If the problem persists, contact support.'}
        </p>
        <Button onClick={reset}>{locale === 'bn' ? 'আবার চেষ্টা করুন' : 'Try again'}</Button>
      </Card>
    </main>
  );
}
