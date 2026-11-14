import { useEffect, useRef, type ComponentProps, type ReactNode } from 'react';
import { QueryClient, QueryClientProvider, useQuery } from '@tanstack/react-query';
import { Route, Switch, Redirect, useLocation, useSearch, Router as WouterRouter } from 'wouter';
import { ErrorBoundary } from '@/components/error-boundary';
import NotFound from '@/pages/not-found';
import LoadingPage from '@/pages/loading';
import ErrorPage from '@/pages/error-page';
import LegalPage from '@/pages/legal-page';
import { HomepageClient } from '@/components/storefront/homepage-client';
import { AccountClient } from '@/components/storefront/account-client';
import { CategoryDetailClient } from '@/components/storefront/category-detail-client';
import { CheckoutClient } from '@/components/storefront/checkout-client';
import { ContactClient } from '@/components/storefront/contact-client';
import { ShopCatalogClient } from '@/components/storefront/shop-catalog-client';
import { OrderTrackingClient } from '@/components/storefront/order-tracking-client';
import { ProductDetailClient } from '@/components/storefront/product-detail-client';
import { AdminErpClient } from '@/components/admin/admin-erp-client';
import { VendorClient } from '@/components/vendor/vendor-client';
import { PageDataRefreshContext } from '@/lib/page-data/context';
import { applyMetadata, type PageMetadata } from '@/lib/page-data/head';

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, refetchOnWindowFocus: false, staleTime: 0 } },
});

interface PageDataPayload {
  page: string;
  props: Record<string, unknown>;
  metadata?: PageMetadata;
  jsonLd?: unknown;
}

async function fetchPageData(path: string, search: string): Promise<PageDataPayload> {
  const sp = new URLSearchParams(search);
  const qs = new URLSearchParams({ pagePath: path });
  const q = sp.get('q');
  const category = sp.get('category');
  if (q !== null) qs.set('q', q);
  if (category !== null) qs.set('category', category);
  const response = await fetch(`/api/page-data?${qs.toString()}`, {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });
  let body: { success?: boolean; data?: PageDataPayload } | null = null;
  try {
    body = await response.json();
  } catch {
    body = null;
  }
  if (body?.success && body.data) return body.data;
  throw new Error(`PAGE_DATA_FAILED_${response.status}`);
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function renderPage(data: PageDataPayload): ReactNode {
  const p = data.props as any;
  switch (data.page) {
    case 'home':
      return <HomepageClient {...(p as ComponentProps<typeof HomepageClient>)} />;
    case 'account':
      return <AccountClient {...(p as ComponentProps<typeof AccountClient>)} />;
    case 'admin':
      return <AdminErpClient {...(p as ComponentProps<typeof AdminErpClient>)} />;
    case 'checkout':
      return <CheckoutClient {...(p as ComponentProps<typeof CheckoutClient>)} />;
    case 'contact':
      return <ContactClient {...(p as ComponentProps<typeof ContactClient>)} />;
    case 'search':
    case 'shop':
      return <ShopCatalogClient {...(p as ComponentProps<typeof ShopCatalogClient>)} />;
    case 'vendor':
      return <VendorClient />;
    case 'category':
      return <CategoryDetailClient {...(p as ComponentProps<typeof CategoryDetailClient>)} />;
    case 'legal':
      return <LegalPage {...(p as ComponentProps<typeof LegalPage>)} />;
    case 'tracking':
      return <OrderTrackingClient {...(p as ComponentProps<typeof OrderTrackingClient>)} />;
    case 'product':
      return (
        <>
          {data.jsonLd ? (
            <script
              type="application/ld+json"
              dangerouslySetInnerHTML={{ __html: JSON.stringify(data.jsonLd).replace(/</g, '\\u003c') }}
            />
          ) : null}
          <ProductDetailClient {...(p as ComponentProps<typeof ProductDetailClient>)} />
        </>
      );
    default:
      return <NotFound />;
  }
}

function PageDataRoute() {
  const [location] = useLocation();
  const search = useSearch();
  const { data, isPending, isError, refetch } = useQuery({
    queryKey: ['page-data', location, search],
    queryFn: () => fetchPageData(location, search),
    placeholderData: (prev, prevQuery) =>
      prevQuery && prevQuery.queryKey[1] === location ? prev : undefined,
  });

  const refetchRef = useRef(refetch);
  refetchRef.current = refetch;

  useEffect(() => {
    if (data) applyMetadata(data.metadata);
  }, [data]);

  if (isPending) return <LoadingPage />;
  if (isError || !data) return <ErrorPage reset={() => void refetchRef.current()} />;

  return (
    <PageDataRefreshContext.Provider value={() => void refetchRef.current()}>
      {renderPage(data)}
    </PageDataRefreshContext.Provider>
  );
}

function ScrollToTop() {
  const [location] = useLocation();
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [location]);
  return null;
}

function KeyedPage() {
  const [location] = useLocation();
  return <PageDataRoute key={location} />;
}

function Router() {
  return (
    <RoutedErrorBoundary>
      <ScrollToTop />
      <Switch>
        <Route path="/" component={KeyedPage} />
        <Route path="/account" component={KeyedPage} />
        <Route path="/admin" component={KeyedPage} />
        <Route path="/categories"><Redirect to="/shop" /></Route>
        <Route path="/checkout" component={KeyedPage} />
        <Route path="/contact" component={KeyedPage} />
        <Route path="/search" component={KeyedPage} />
        <Route path="/shop" component={KeyedPage} />
        <Route path="/vendor" component={KeyedPage} />
        <Route path="/category/:slug" component={KeyedPage} />
        <Route path="/legal/:slug" component={KeyedPage} />
        <Route path="/order-tracking/:orderNo" component={KeyedPage} />
        <Route path="/product/:slug" component={KeyedPage} />
        <Route component={NotFound} />
      </Switch>
    </RoutedErrorBoundary>
  );
}

function RoutedErrorBoundary({ children }: { children: ReactNode }) {
  const [location] = useLocation();
  return <ErrorBoundary resetKey={location}>{children}</ErrorBoundary>;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, '')}>
        <Router />
      </WouterRouter>
    </QueryClientProvider>
  );
}

export default App;
