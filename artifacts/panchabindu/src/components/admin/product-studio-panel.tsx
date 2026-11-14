'use client';
import { localizedField } from '@/lib/i18n/ui-text';
import { uiText } from '@/lib/i18n/ui-text';
import { productImageUrl, productImageFallback } from '@/lib/storefront/product-image';

import { LocalizedText } from '@/components/ui/localized-text';
import { CatalogImportPanel } from './catalog-import-panel';


import React, { useState, useMemo } from 'react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  Filter,
  Layers,
  ArrowRight,
  TrendingUp,
  AlertTriangle,
  CheckCircle2,
  Truck,
  ShieldCheck,
  Wallet,
  Printer,
  Star,
  ExternalLink,
  ChevronDown,
  ChevronUp,
  X,
  RefreshCw,
  Image as ImageIcon,
  DollarSign,
  Tag,
  Building,
} from 'lucide-react';
import type {
  InternalProductRecord,
  InternalVariantRecord,
  CategoryRecord,
} from '@/lib/db/repository';
import type { VendorProfileRecord } from '@/lib/admin/phase4b-service';
import type { OrderGridRowDTO } from '@/types/domain';
import type { DistrictRateOverrideRecord } from '@/lib/admin/phase4b-service';
import { formatPoishaToBdt, parseTakaStringToPoisha } from '@/lib/money';
import { formatLocaleNumber } from '@/lib/i18n/dictionaries';
import { useLocaleStore } from '@/store/use-locale-store';

const poishaToTaka = (p: number) => Math.round((p || 0) / 100);

interface EnrichedOrderRow extends Partial<OrderGridRowDTO> {
  items?: Array<{
    productId: string;
    variantId: string;
    productNameBn: string;
    variantTitleBn: string;
    publicSku: string;
    quantity: number;
    unitSalePricePoisha: number;
    lineSubtotalPoisha: number;
  }>;
}

interface ProductStudioPanelProps {
  products: InternalProductRecord[];
  categories: CategoryRecord[];
  vendors: VendorProfileRecord[];
  orders?: EnrichedOrderRow[];
  districtRates?: DistrictRateOverrideRecord[];
  onRefresh: () => Promise<void>;
  currentUserId: string;
  userRole: string;
  locale?: 'bn' | 'en';
}

interface VariantFormData {
  variantId?: string;
  internalVendorSku: string;
  publicSku: string;
  titleBn: string;
  titleEn: string;
  weightGrams: number;
  stockOnHand: number;
  supplierCostBdt: number;
  supplierProfitBdt: number;
  platformMarginBdt: number;
  mrpPriceBdt: number;
  imageUrl: string;
  size: string;
  color: string;
}

interface ProductFormData {
  productId?: string;
  vendorId: string;
  categoryId: string;
  nameBn: string;
  nameEn: string;
  descriptionBn: string;
  descriptionEn: string;
  isFeatured: boolean;
  isFreeDelivery: boolean;
  requiresAdvanceCourierCharge?: boolean;
  customAdvanceDepositPoisha?: number;
  lowStockThreshold: number;
  leadTimeDays: number;
  status: 'active' | 'draft' | 'archived';
  images: string[];
  specs: Array<{ labelBn: string; labelEn: string; valueBn: string; valueEn: string }>;
  variants: VariantFormData[];
}

const DEFAULT_VARIANT: VariantFormData = {
  internalVendorSku: '',
  publicSku: '',
  titleBn: 'স্ট্যান্ডার্ড ভ্যারিয়েন্ট',
  titleEn: 'Standard Variant',
  weightGrams: 500,
  stockOnHand: 0,
  supplierCostBdt: 0,
  supplierProfitBdt: 0,
  platformMarginBdt: 0,
  mrpPriceBdt: 0,
  imageUrl: '',
  size: 'Regular',
  color: 'Default',
};

export function ProductManagementStudioPanel({
  products,
  categories,
  vendors,
  orders = [],
  districtRates = [],
  onRefresh,
  currentUserId,
  userRole,
  locale: propLocale,
}: ProductStudioPanelProps) {
  const storeLocale = useLocaleStore((s) => s.adminLocale);
  const locale = propLocale ?? storeLocale ?? 'en';
  const isBn = locale === 'bn';
  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'connectivity'>('products');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  
  // Editor Drawer State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormData | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrlsDraft, setImageUrlsDraft] = useState('');
  const [stagedImages, setStagedImages] = useState<Array<{ assetId: string; productId: string; previewUrl: string }>>([]);
  const uploadController = React.useRef<AbortController | null>(null);
  React.useEffect(() => () => uploadController.current?.abort(), []);

  const uploadImage = async (file: File) => {
    if (!editingProduct?.productId) return;
    setIsUploading(true);
    setFeedbackMsg(null);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const body = new FormData();
      body.set('productId', editingProduct.productId);
      body.set('file', file);
      const response = await fetch('/api/media', { method: 'POST', body, signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.code === 'STORAGE_NOT_CONFIGURED' ? (isBn ? 'আপলোড স্টোরেজ কনফিগার করা নেই। সরাসরি HTTPS ছবির লিংক ব্যবহার করুন।' : 'Upload storage is not configured. Use a direct HTTPS image URL.') : (isBn ? 'ছবি আপলোড হয়নি। ফাইল ও স্টোরেজ সংযোগ যাচাই করুন।' : 'Upload failed. Check the file and storage connection.'));
      const previewResponse = await fetch(`/api/media/${data.assetId}`);
      const preview = await previewResponse.json();
      if (!previewResponse.ok || !preview.previewUrl) throw new Error(isBn ? 'ছবির প্রিভিউ পাওয়া যায়নি।' : 'The image preview is unavailable.');
      setStagedImages(images => [...images.filter(image => image.assetId !== data.assetId), { assetId: data.assetId, productId: editingProduct.productId!, previewUrl: preview.previewUrl }]);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) setFeedbackMsg({ type: 'error', text: error instanceof Error ? error.message : 'Upload failed.' });
    } finally { setIsUploading(false); }
  };

  const approveImage = async (assetId: string) => {
    setIsUploading(true);
    try {
      const response = await fetch(`/api/media/${assetId}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success || !data.url) throw new Error(isBn ? 'ছবির অনুমোদন ব্যর্থ হয়েছে।' : 'Unable to approve this image.');
      setEditingProduct(product => product ? { ...product, images: [data.url, ...product.images.filter(image => image !== data.url)] } : product);
      setImageUrlsDraft(current => [data.url, ...current.split(/[,\n]/).map(v => v.trim()).filter(v => v && v !== data.url)].join('\n'));
      setStagedImages(images => images.filter(image => image.assetId !== assetId));
      await onRefresh();
    } catch (error) { setFeedbackMsg({ type: 'error', text: error instanceof Error ? error.message : 'Approval failed.' }); }
    finally { setIsUploading(false); }
  };
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Product linkage inspector state
  const [inspectProduct, setInspectProduct] = useState<InternalProductRecord | null>(null);

  // Category Editor Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const anyStudioDialogOpen = isEditorOpen || Boolean(inspectProduct) || isCategoryModalOpen;
  React.useEffect(() => {
    if (!anyStudioDialogOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Close the top-most dialog only (category modal, then inspector, then editor).
      if (isCategoryModalOpen) setIsCategoryModalOpen(false);
      else if (inspectProduct) setInspectProduct(null);
      else setIsEditorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [anyStudioDialogOpen, isCategoryModalOpen, inspectProduct]);
  const [categoryFormData, setCategoryFormData] = useState({
    id: '',
    nameBn: '',
    nameEn: '',
    descriptionBn: '',
    descriptionEn: '',
    iconName: 'Package',
    sortOrder: 1,
    isActive: true,
  });

  // Filtered Products
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategoryFilter !== 'all' && p.categoryId !== selectedCategoryFilter) return false;
      if (selectedVendorFilter !== 'all' && p.vendorId !== selectedVendorFilter) return false;
      if (selectedStatusFilter !== 'all' && p.status !== selectedStatusFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchName = p.nameBn.toLowerCase().includes(q) || p.nameEn.toLowerCase().includes(q);
        const matchSku = p.variants.some(
          (v) =>
            v.publicSku.toLowerCase().includes(q) ||
            v.internalVendorSku.toLowerCase().includes(q)
        );
        if (!matchName && !matchSku) return false;
      }
      return true;
    });
  }, [products, selectedCategoryFilter, selectedVendorFilter, selectedStatusFilter, searchQuery]);

  // Handle open editor for new product
  const handleAddNewProduct = () => {
    setImageUrlsDraft('');
    const defaultVendor = vendors[0]?.vendorId ?? '';
    const defaultCat = categories[0]?.id ?? '';
    setEditingProduct({
      vendorId: defaultVendor,
      categoryId: defaultCat,
      nameBn: '',
      nameEn: '',
      descriptionBn: '',
      descriptionEn: '',
      isFeatured: false,
      isFreeDelivery: false,
      requiresAdvanceCourierCharge: false,
      customAdvanceDepositPoisha: 0,
      lowStockThreshold: 5,
      leadTimeDays: 2,
      status: 'draft',
      images: [],
      specs: [],
      variants: [{ ...DEFAULT_VARIANT, publicSku: `BG-${Date.now().toString().slice(-4)}` }],
    });
    setIsEditorOpen(true);
  };

  // Recover pending images after closing or reloading the editor.
  const loadPendingImages = async (productId: string) => {
    try {
      const response = await fetch(`/api/media?productId=${encodeURIComponent(productId)}`);
      if (!response.ok) return;
      const data = await response.json();
      if (data.success && Array.isArray(data.assets)) setStagedImages(previous => [
        ...previous.filter(image => image.productId !== productId),
        ...data.assets.filter((asset: { previewUrl?: string }) => asset.previewUrl),
      ]);
    } catch { /* Editing by URL remains available without storage. */ }
  };

  // Handle open editor for existing product
  const handleEditProduct = (prod: InternalProductRecord) => {
    void loadPendingImages(prod.productId);
    setImageUrlsDraft((prod.images ?? []).join('\n'));
    setEditingProduct({
      productId: prod.productId,
      vendorId: prod.vendorId,
      categoryId: prod.categoryId,
      nameBn: prod.nameBn,
      nameEn: prod.nameEn,
      descriptionBn: prod.descriptionBn,
      descriptionEn: prod.descriptionEn,
      isFeatured: prod.isFeatured,
      isFreeDelivery: prod.isFreeDelivery,
      requiresAdvanceCourierCharge: prod.requiresAdvanceCourierCharge ?? false,
      customAdvanceDepositPoisha: prod.customAdvanceDepositPoisha ?? 0,
      lowStockThreshold: prod.lowStockThreshold,
      leadTimeDays: prod.leadTimeDays,
      status: prod.status,
      images: [...(prod.images ?? [])],
      specs: prod.specs && prod.specs.length > 0 ? [...prod.specs] : [
        { labelBn: 'ম্যাটেরিয়াল', labelEn: 'Material', valueBn: '১০০% পিওর কটন', valueEn: '100% Pure Cotton' },
      ],
      variants: prod.variants.map((v) => ({
        variantId: v.variantId,
        internalVendorSku: v.internalVendorSku,
        publicSku: v.publicSku,
        titleBn: v.titleBn,
        titleEn: v.titleEn,
        weightGrams: v.weightGrams,
        stockOnHand: v.stockOnHand,
        supplierCostBdt: poishaToTaka(v.supplierCostPoisha),
        supplierProfitBdt: poishaToTaka(v.supplierProfitPoisha),
        platformMarginBdt: poishaToTaka(v.platformMarginPoisha),
        mrpPriceBdt: poishaToTaka(v.compareAtPricePoisha ?? v.salePricePoisha),
        imageUrl: v.imageUrl ?? prod.images[0] ?? '',
        size: v.attributes?.['সাইজ'] ?? v.attributes?.['size'] ?? 'Regular',
        color: v.attributes?.['রং'] ?? v.attributes?.['color'] ?? 'Default',
      })),
    });
    setIsEditorOpen(true);
  };

  // Submit Product Form
  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    setIsSaving(true);
    setFeedbackMsg(null);

    try {
      const payloadVariants = editingProduct.variants.map((v) => {
        const costPoisha = parseTakaStringToPoisha(String(v.supplierCostBdt));
        const profitPoisha = parseTakaStringToPoisha(String(v.supplierProfitBdt));
        const payablePoisha = costPoisha + profitPoisha;
        const marginPoisha = parseTakaStringToPoisha(String(v.platformMarginBdt));
        const salePricePoisha = payablePoisha + marginPoisha;
        const mrpPoisha = parseTakaStringToPoisha(String(v.mrpPriceBdt));

        return {
          variantId: v.variantId,
          internalVendorSku: v.internalVendorSku || `VND-${v.publicSku}`,
          publicSku: v.publicSku,
          titleBn: v.titleBn,
          titleEn: v.titleEn,
          attributes: { সাইজ: v.size, রং: v.color },
          imageUrl: v.imageUrl || null,
          supplierCostPoisha: costPoisha,
          supplierProfitPoisha: profitPoisha,
          supplierPayablePoisha: payablePoisha,
          platformMarginPoisha: marginPoisha,
          salePricePoisha: salePricePoisha,
          mrpPricePoisha: mrpPoisha,
          stockOnHand: Number(v.stockOnHand) || 0,
          weightGrams: Number(v.weightGrams) || 500,
          isActive: true,
        };
      });

      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_product',
          product: {
            productId: editingProduct.productId,
            vendorId: editingProduct.vendorId,
            categoryId: editingProduct.categoryId,
            nameBn: editingProduct.nameBn,
            nameEn: editingProduct.nameEn,
            descriptionBn: editingProduct.descriptionBn,
            descriptionEn: editingProduct.descriptionEn,
            isFeatured: editingProduct.isFeatured,
            isFreeDelivery: editingProduct.isFreeDelivery,
            requiresAdvanceCourierCharge: Boolean(editingProduct.requiresAdvanceCourierCharge),
            customAdvanceDepositPoisha: Number(editingProduct.customAdvanceDepositPoisha) || 0,
            lowStockThreshold: Number(editingProduct.lowStockThreshold) || 5,
            leadTimeDays: Number(editingProduct.leadTimeDays) || 2,
            status: editingProduct.status,
            images: editingProduct.images.filter(Boolean),
            specs: editingProduct.specs.filter((s) => s.labelBn && s.valueBn),
            variants: payloadVariants,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.errorBn || 'পণ্য সংরক্ষণ করা সম্ভব হয়নি।');
      }

      setFeedbackMsg({ type: 'success', text: 'পণ্য সফলভাবে ক্যাটালগে সংরক্ষিত হয়েছে।' });
      setIsEditorOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      setFeedbackMsg({
        type: 'error',
        text: err instanceof Error ? err.message : 'ত্রুটি ঘটেছে।',
      });
    } finally {
      setIsSaving(false);
    }
  };

  // Delete product
  const handleDeleteProduct = async (productId: string) => {
    if (!confirm('আপনি কি নিশ্চিত যে এই পণ্যটি ক্যাটালগ থেকে সরাতে চান?')) return;
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete_product',
          productId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorBn || 'ডিলিট ব্যর্থ হয়েছে।');
      } else {
        await onRefresh();
      }
    } catch {
      alert('সার্ভারে ত্রুটি হয়েছে।');
    }
  };

  // Save category
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'upsert_category',
          category: {
            id: categoryFormData.id || undefined,
            nameBn: categoryFormData.nameBn,
            nameEn: categoryFormData.nameEn,
            descriptionBn: categoryFormData.descriptionBn,
            descriptionEn: categoryFormData.descriptionEn,
            iconName: categoryFormData.iconName,
            sortOrder: Number(categoryFormData.sortOrder) || 1,
            isActive: categoryFormData.isActive,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        alert(data.errorBn || 'ক্যাটাগরি সংরক্ষণ ব্যর্থ হয়েছে।');
      } else {
        setIsCategoryModalOpen(false);
        await onRefresh();
      }
    } catch {
      alert('সার্ভারে ত্রুটি হয়েছে।');
    }
  };

  return (
    <div className="space-y-6">
      {userRole === 'super_admin' && <CatalogImportPanel locale={locale} onComplete={onRefresh} />}
      {/* Top Banner & Tab Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface border border-border">
        <div>
          <div className="flex items-center gap-2">
            <span className="p-2 bg-bg border border-border text-ink">
              <Package className="w-5 h-5 text-accent" />
            </span>
            <div>
              <h1 className="text-lg font-bold text-ink">
                {isBn ? 'প্রোডাক্ট ও ক্যাটাগরি স্টুডিও' : 'Product & Category Studio'}
              </h1>
              <p className="text-xs text-muted">
                {isBn
                  ? 'মাল্টি-ভ্যারিয়েন্ট SKU, ৩-স্তরীয় পয়সা প্রাইসিং ও ওয়্যারহাউস স্টক'
                  : 'Multi-variant SKU, 3-tier Poisha pricing and warehouse inventory'}
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleAddNewProduct}
            className="flex items-center gap-1.5 px-4 py-2 bg-ink text-bg font-semibold text-xs border border-ink hover:opacity-90 transition-opacity"
          >
            <Plus className="w-4 h-4" />
            {isBn ? 'নতুন পণ্য যোগ করুন' : 'Add New Product'}
          </button>
          <button
            type="button"
            onClick={() => {
              setCategoryFormData({
                id: '',
                nameBn: '',
                nameEn: '',
                descriptionBn: '',
                descriptionEn: '',
                iconName: 'Package',
                sortOrder: categories.length + 1,
                isActive: true,
              });
              setIsCategoryModalOpen(true);
            }}
            className="flex items-center gap-1.5 px-3 py-2 bg-surface text-ink text-xs font-semibold border border-border hover:bg-bg transition-colors"
          >
            <Layers className="w-4 h-4 text-muted" />
            {isBn ? 'ক্যাটাগরি যোগ করুন' : 'Add Category'}
          </button>
        </div>
      </div>

      {feedbackMsg && (
        <div
          className={`p-3 text-xs font-medium border ${
            feedbackMsg.type === 'success'
              ? 'bg-success/10 border-success/30 text-success'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          {feedbackMsg.text}
        </div>
      )}

      {/* Main Sub Tabs */}
      <div className="flex border-b border-border text-xs font-medium">
        <button
          type="button"
          onClick={() => setActiveTab('products')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'products'
              ? 'border-ink text-ink font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {isBn ? 'সকল পণ্য ক্যাটালগ' : 'All Products Catalog'} ({products.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('categories')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'categories'
              ? 'border-ink text-ink font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {isBn ? 'ক্যাটাগরি ম্যানেজার' : 'Category Manager'} ({categories.length})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('connectivity')}
          className={`px-4 py-2.5 border-b-2 transition-colors ${
            activeTab === 'connectivity'
              ? 'border-ink text-ink font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {isBn ? 'পণ্য সংযোগ পর্যালোচনা' : 'Product Linkage Review'}
        </button>
      </div>

      {/* TAB 1: PRODUCT CATALOG */}
      {activeTab === 'products' && (
        <div className="space-y-4">
          {/* Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-surface border border-border text-xs">
            {/* Search */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-muted" />
              <input
                type="text"
                placeholder={isBn ? 'নাম বা SKU দিয়ে সার্চ করুন...' : 'Search by name or SKU...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
              />
            </div>

            {/* Category Filter */}
            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
            >
              <option value="all">{isBn ? 'সকল ক্যাটাগরি' : 'All Categories'}</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {isBn ? c.nameBn : c.nameEn} ({isBn ? c.nameEn : c.nameBn})
                </option>
              ))}
            </select>

            {/* Vendor Filter */}
            <select
              value={selectedVendorFilter}
              onChange={(e) => setSelectedVendorFilter(e.target.value)}
              className="px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
            >
              <option value="all">{isBn ? 'সকল ভেন্ডর' : 'All Vendors'}</option>
              {vendors.map((v) => (
                <option key={v.vendorId} value={v.vendorId}>
                  {isBn ? v.businessNameBn : v.businessNameEn} ({isBn ? v.businessNameEn : v.businessNameBn})
                </option>
              ))}
            </select>

            {/* Status Filter */}
            <select
              value={selectedStatusFilter}
              onChange={(e) => setSelectedStatusFilter(e.target.value)}
              className="px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
            >
              <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
              <option value="active">{isBn ? 'সক্রিয় (Active)' : 'Active'}</option>
              <option value="draft">{isBn ? 'ড্রাফট (Draft)' : 'Draft'}</option>
              <option value="archived">{isBn ? 'আর্কাইভড (Archived)' : 'Archived'}</option>
            </select>
          </div>

          {/* Product Cards / Table */}
          <div className="bg-surface border border-border overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-bg border-b border-border text-muted font-bold uppercase tracking-wider text-[11px]">
                  <th className="p-3">{isBn ? 'পণ্য ও ছবি' : 'Product & Media'}</th>
                  <th className="p-3">{isBn ? 'ক্যাটাগরি ও ভেন্ডর' : 'Category & Vendor'}</th>
                  <th className="p-3">{isBn ? 'ভ্যারিয়েন্ট ও SKU' : 'Variants & SKU'}</th>
                  <th className="p-3">{isBn ? '৩-স্তরীয় প্রাইসিং ব্রেকডাউন' : '3-Tier Pricing Breakdown'}</th>
                  <th className="p-3">{isBn ? 'ওয়্যারহাউস স্টক' : 'Warehouse Stock'}</th>
                  <th className="p-3">{isBn ? 'ওজন ও কুরিয়ার ফি' : 'Weight & Courier Fee'}</th>
                  <th className="p-3 text-right">{isBn ? 'অ্যাকশন' : 'Action'}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {filteredProducts.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-muted">
                      {isBn
                        ? 'কোনো পণ্য পাওয়া যায়নি। "নতুন পণ্য যোগ করুন" বাটনে ক্লিক করে পণ্য তৈরি করুন।'
                        : 'No products found. Click "Add New Product" to create a product.'}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const primaryVariant = p.variants[0];
                    const category = categories.find((c) => c.id === p.categoryId);
                    const vendor = vendors.find((v) => v.vendorId === p.vendorId);
                    const totalStock = p.variants.reduce((sum, v) => sum + (v.stockOnHand || 0), 0);
                    const isLowStock = totalStock <= p.lowStockThreshold;

                    return (
                      <tr key={p.productId} className="hover:bg-bg/50 transition-colors">
                        {/* Product Info & Thumb */}
                        <td className="p-3 align-top min-w-[200px]">
                          <div className="flex items-start gap-2.5">
                            <div className="w-12 h-12 shrink-0 bg-bg border border-border overflow-hidden">
                              {p.images && p.images[0] ? (
                                <img
                                  src={productImageUrl(p.images[0])} onError={productImageFallback}
                                  alt={p.nameBn}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted">
                                  <Package className="w-4 h-4" />
                                </div>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-bold text-ink">{isBn ? p.nameBn : (p.nameEn || p.nameBn)}</p>
                              <p className="text-[11px] text-muted font-mono">{isBn ? p.nameEn : p.nameBn}</p>
                              <div className="flex items-center gap-1.5 pt-1">
                                <span
                                  className={`px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide border ${
                                    p.status === 'active'
                                      ? 'bg-success/10 text-success border-success/30'
                                      : p.status === 'draft'
                                      ? 'bg-warning/10 text-warning border-warning/30'
                                      : 'bg-muted/10 text-muted border-border'
                                  }`}
                                >
                                  {p.status}
                                </span>
                                {p.isFeatured && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-accent/10 text-accent border border-accent/30">
                                    {isBn ? 'নির্বাচিত' : 'Featured'}
                                  </span>
                                )}
                                {p.isFreeDelivery && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-info/10 text-info border border-info/30">
                                    {isBn ? 'ফ্রি ডেলিভারি' : 'Free Delivery'}
                                  </span>
                                )}
                                {p.requiresAdvanceCourierCharge && (
                                  <span className="px-1.5 py-0.5 text-[9px] font-bold bg-amber-500/10 text-amber-800 border border-amber-500/30">
                                    {isBn ? 'অগ্রিম কুরিয়ার চার্জ' : 'Advance Courier'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        {/* Category & Vendor */}
                        <td className="p-3 align-top">
                          <p className="font-semibold text-ink">
                            {category ? (isBn ? category.nameBn : category.nameEn) : p.categoryId}
                          </p>
                          <p className="text-[11px] text-muted">
                            {vendor ? (isBn ? vendor.businessNameBn : vendor.businessNameEn) : p.vendorBusinessName}
                          </p>
                          <p className="text-[10px] font-mono text-muted"><LocalizedText source={"ID:"} area="admin" />{" "}{p.vendorCode}</p>
                        </td>

                        {/* Variants & SKUs */}
                        <td className="p-3 align-top min-w-[150px]">
                          <span className="font-bold text-ink">
                            {p.variants.length} {isBn ? 'টি ভ্যারিয়েন্ট' : 'variants'}
                          </span>
                          <div className="mt-1 space-y-1">
                            {p.variants.slice(0, 2).map((v) => (
                              <div key={v.variantId} className="text-[11px] leading-tight font-mono">
                                <span className="text-ink font-semibold">{v.publicSku}</span>
                                <span className="text-muted block text-[10px]">
                                  {isBn ? 'ইন্টারনাল:' : 'Internal:'} {v.internalVendorSku}
                                </span>
                              </div>
                            ))}
                            {p.variants.length > 2 && (
                              <span className="text-[10px] text-muted italic">
                                {isBn ? `+ আরও ${p.variants.length - 2}টি ভ্যারিয়েন্ট` : `+ ${p.variants.length - 2} more variants`}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* 3-Tier Pricing Breakdown */}
                        <td className="p-3 align-top min-w-[190px]">
                          {primaryVariant && (
                            <div className="space-y-1 text-[11px]">
                              <div className="flex justify-between text-muted">
                                <span>{isBn ? 'সাপ্লায়ার খরচ:' : 'Supplier Cost:'}</span>
                                <span>{formatPoishaToBdt(primaryVariant.supplierCostPoisha, locale)}</span>
                              </div>
                              <div className="flex justify-between text-muted">
                                <span>{isBn ? 'সাপ্লায়ার লাভ:' : 'Supplier Profit:'}</span>
                                <span>{formatPoishaToBdt(primaryVariant.supplierProfitPoisha, locale)}</span>
                              </div>
                              <div className="flex justify-between font-medium text-ink pt-0.5 border-t border-border">
                                <span>{isBn ? 'সাপ্লায়ার প্রদেয়:' : 'Supplier Payable:'}</span>
                                <span>{formatPoishaToBdt(primaryVariant.supplierPayablePoisha, locale)}</span>
                              </div>
                              <div className="flex justify-between text-success font-medium">
                                <span>{isBn ? 'প্ল্যাটফর্ম মার্জিন:' : 'Platform Margin:'}</span>
                                <span>+{formatPoishaToBdt(primaryVariant.platformMarginPoisha, locale)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-ink pt-0.5 border-t border-border text-xs">
                                <span>{isBn ? 'খুচরা বিক্রয় মূল্য:' : 'Retail Sale Price:'}</span>
                                <span className="text-accent">{formatPoishaToBdt(primaryVariant.salePricePoisha, locale)}</span>
                              </div>
                            </div>
                          )}
                        </td>

                        {/* Warehouse Stock */}
                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                className={`w-2 h-2 rounded-full ${
                                  totalStock === 0
                                    ? 'bg-danger'
                                    : isLowStock
                                    ? 'bg-warning'
                                    : 'bg-success'
                                }`}
                              />
                              <span className="font-bold text-ink">
                                {formatLocaleNumber(totalStock, locale)} {isBn ? 'পিস' : 'pcs'}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted">
                              {isBn ? 'রিজার্ভড:' : 'Reserved:'} {formatLocaleNumber(p.variants.reduce((s, v) => s + (v.stockReserved || 0), 0), locale)} {isBn ? 'পিস' : 'pcs'}
                            </p>
                            {isLowStock && (
                              <span className="inline-block text-[9px] font-bold text-warning border border-warning/30 bg-warning/10 px-1 py-0.5">
                                {isBn ? 'লো স্টক অ্যালার্ট' : 'Low Stock Alert'}
                              </span>
                            )}
                          </div>
                        </td>

                        {/* Parcel Weight & Courier Slab */}
                        <td className="p-3 align-top">
                          <p className="font-mono font-semibold text-ink">
                            {primaryVariant?.weightGrams ?? 500} {isBn ? 'গ্রাম' : 'g'}
                          </p>
                          <p className="text-[10px] text-muted">
                            {isBn ? 'ঢাকা: ৳৭০ | ঢাকার বাইরে: ৳১৩০' : 'Dhaka: ৳70 | Outside: ৳130'}
                          </p>
                          {((primaryVariant?.weightGrams ?? 500) > 1000) && (
                            <span className="text-[10px] text-warning font-semibold">
                              {isBn ? '+৳২০/কেজি অতিরিক্ত চার্জ' : '+৳20/kg extra charge'}
                            </span>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-3 align-top text-right space-x-1 whitespace-nowrap">
                          <button
                            type="button"
                            title={isBn ? 'পণ্যের সংযোগের তথ্য দেখুন' : 'View product linkage details'}
                            onClick={() => setInspectProduct(p)}
                            className="p-1.5 bg-bg border border-border text-ink hover:border-ink transition-colors"
                          >
                            <TrendingUp className="w-3.5 h-3.5 text-accent" />
                          </button>
                          <button
                            type="button"
                            title={isBn ? 'পণ্য এডিট করুন' : 'Edit Product'}
                            onClick={() => handleEditProduct(p)}
                            className="p-1.5 bg-bg border border-border text-ink hover:border-ink transition-colors"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            title={isBn ? 'মুছে ফেলুন' : 'Delete'}
                            onClick={() => handleDeleteProduct(p.productId)}
                            className="p-1.5 bg-bg border border-border text-danger hover:border-danger transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 2: CATEGORY MANAGER */}
      {activeTab === 'categories' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-surface border border-border text-xs">
            <p className="text-muted">
              {isBn
                ? 'স্টোরফ্রন্ট নেভিগেশন ও হোমপেজের ফিল্টার সেকশনের জন্য ক্যাটাগরি তৈরি ও সাজানো।'
                : 'Create and organize categories for storefront navigation and catalog filters.'}
            </p>
            <button
              type="button"
              onClick={() => {
                setCategoryFormData({
                  id: '',
                  nameBn: '',
                  nameEn: '',
                  descriptionBn: '',
                  descriptionEn: '',
                  iconName: 'Package',
                  sortOrder: categories.length + 1,
                  isActive: true,
                });
                setIsCategoryModalOpen(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-ink text-bg font-semibold text-xs border border-ink"
            >
              <Plus className="w-3.5 h-3.5" />
              {isBn ? 'নতুন ক্যাটাগরি' : 'New Category'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const productCount = products.filter((p) => p.categoryId === cat.id).length;
              return (
                <div key={cat.id} className="p-4 bg-surface border border-border flex flex-col justify-between">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted">
                        {isBn ? 'অর্ডার:' : 'Order:'} #{cat.sortOrder}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[9px] font-bold uppercase border ${
                          cat.isActive
                            ? 'bg-success/10 text-success border-success/30'
                            : 'bg-muted/10 text-muted border-border'
                        }`}
                      >
                        {cat.isActive ? (isBn ? 'সক্রিয়' : 'Active') : (isBn ? 'নিষ্ক্রিয়' : 'Inactive')}
                      </span>
                    </div>
                    <h3 className="font-bold text-ink text-sm">{isBn ? cat.nameBn : (cat.nameEn || cat.nameBn)}</h3>
                    <p className="text-xs font-mono text-muted">{isBn ? cat.nameEn : cat.nameBn} ({cat.slug})</p>
                    <p className="text-xs text-muted leading-relaxed line-clamp-2">
                      {isBn ? cat.descriptionBn : (cat.descriptionEn || cat.descriptionBn)}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border flex items-center justify-between">
                    <span className="text-xs font-semibold text-accent">
                      {productCount} {isBn ? 'টি পণ্য সংযুক্ত' : 'products linked'}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setCategoryFormData({
                          id: cat.id,
                          nameBn: cat.nameBn,
                          nameEn: cat.nameEn,
                          descriptionBn: cat.descriptionBn,
                          descriptionEn: cat.descriptionEn,
                          iconName: cat.iconName,
                          sortOrder: cat.sortOrder,
                          isActive: cat.isActive,
                        });
                        setIsCategoryModalOpen(true);
                      }}
                      className="px-2.5 py-1 text-xs border border-border hover:border-ink transition-colors text-ink font-medium"
                    >
                      {isBn ? 'এডিট করুন' : 'Edit'}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* These checks describe the current workspace data, not end-to-end integration health. */}
      {activeTab === 'connectivity' && (
        <section className="space-y-4" aria-label={isBn ? 'পণ্য সংযোগ পর্যালোচনা' : 'Product linkage review'}>
          <h2 className="font-bold text-ink text-sm">{isBn ? 'পণ্য সংযোগ পর্যালোচনা' : 'Product linkage review'}</h2>
          <p className="text-xs text-muted">{isBn ? 'বর্তমান তালিকায় ভেন্ডর, ক্যাটাগরি ও ভ্যারিয়েন্টের তথ্য দেখানো হচ্ছে। এটি অর্ডার, স্টক, পেমেন্ট বা কুরিয়ার সংযোগের পূর্ণাঙ্গ পরীক্ষা নয়।' : 'Vendor, category and variant information is checked against the current workspace data. This is not an end-to-end test of orders, stock, payments or couriers.'}</p>
          {products.length === 0 ? <p className="text-sm text-muted">{isBn ? 'কোনো পণ্য নেই।' : 'No products available.'}</p> : products.map(product => {
            const vendor = vendors.find(v => v.vendorId === product.vendorId);
            const category = categories.find(c => c.id === product.categoryId);
            return <div key={product.productId} className="p-3 border border-border bg-surface space-y-1 text-xs">
              <p className="font-bold">{isBn ? product.nameBn : product.nameEn}</p>
              <p>{isBn ? 'ভেন্ডর' : 'Vendor'}: {vendor ? (isBn ? vendor.businessNameBn : vendor.businessNameEn || vendor.businessNameBn) : (isBn ? 'বর্তমান তালিকায় পাওয়া যায়নি' : 'Not available in this view')}</p>
              <p>{isBn ? 'ক্যাটাগরি' : 'Category'}: {category ? (isBn ? category.nameBn : category.nameEn) : (isBn ? 'বর্তমান তালিকায় পাওয়া যায়নি' : 'Not available in this view')}</p>
              <p>{isBn ? 'ভ্যারিয়েন্ট' : 'Variants'}: {formatLocaleNumber(product.variants?.length ?? 0, locale)}</p>
            </div>;
          })}
        </section>
      )}

      {/* PRODUCT ADD / EDIT DRAWER / MODAL */}
      {isEditorOpen && editingProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-end">
          <div className="w-full max-w-4xl h-[100dvh] bg-surface border-l border-border p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto space-y-6 animate-in slide-in-from-right">
            <div className="flex items-center justify-between border-b border-border pb-4">
              <div>
                <h2 className="text-base font-bold text-ink">
                  {editingProduct.productId ? 'পণ্য তথ্য এডিট করুন' : 'নতুন পণ্য যুক্ত করুন'}
                </h2>
                <p className="text-xs text-muted">
                  <LocalizedText source={"৩-স্তরীয় পয়সা প্রাইসিং ক্যালকুলেটর, মাল্টি-ভ্যারিয়েন্ট SKU এবং ওয়্যারহাউস স্টক"} area="admin" />{" "}</p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                className="p-1 text-muted hover:text-ink transition-colors"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="space-y-6 text-xs">
              {/* Basic Details */}
              <div className="space-y-4">
                <h3 className="font-bold text-ink uppercase text-[11px] tracking-wider text-muted">
                  <LocalizedText source={"১. সাধারণ তথ্য ও আইডেন্টিফিকেশন"} area="admin" />{" "}</h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-ink"><LocalizedText source={"পণ্যের নাম (বাংলা) *"} area="admin" /></label>
                    <input
                      type="text"
                      required
                      placeholder={uiText("যেমন: প্রিমিয়াম জামদানি শাড়ি", locale)}
                      value={editingProduct.nameBn}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, nameBn: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-ink"><LocalizedText source={"Product Name (English) *"} area="admin" /></label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Premium Handloom Jamdani Saree"
                      value={editingProduct.nameEn}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, nameEn: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label className="font-semibold text-ink"><LocalizedText source={"ক্যাটাগরি নির্বাচন করুন *"} area="admin" /></label>
                    <select
                      required
                      value={editingProduct.categoryId}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, categoryId: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {localizedField(c, "nameBn", locale)} ({c.nameEn})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-ink"><LocalizedText source={"ভেন্ডর / প্রস্তুতকারক *"} area="admin" /></label>
                    <select
                      required
                      value={editingProduct.vendorId}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, vendorId: e.target.value })
                      }
                      className="w-full px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
                    >
                      {vendors.map((v) => (
                        <option key={v.vendorId} value={v.vendorId}>
                          {localizedField(v, "businessNameBn", locale)} ({v.businessNameEn})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="font-semibold text-ink"><LocalizedText source={"ক্যাটালগ স্ট্যাটাস *"} area="admin" /></label>
                    <select
                      value={editingProduct.status}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          status: e.target.value as 'active' | 'draft' | 'archived',
                        })
                      }
                      className="w-full px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink"
                    >
                      <option value="active"><LocalizedText source={"সক্রিয় (Active)"} area="admin" /></option>
                      <option value="draft"><LocalizedText source={"ড্রাফট (Draft)"} area="admin" /></option>
                      <option value="archived"><LocalizedText source={"আর্কাইভড (Archived)"} area="admin" /></option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-ink"><LocalizedText source={"পণ্যের পূর্ণ বিবরণ (বাংলা) *"} area="admin" /></label>
                  <textarea
                    rows={3}
                    required
                    placeholder={uiText("পণ্যের গুণগত মান, সুতা, তৈরির বিবরণ ইত্যাদি...", locale)}
                    value={editingProduct.descriptionBn}
                    onChange={(e) =>
                      setEditingProduct({ ...editingProduct, descriptionBn: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-bg border border-border text-ink focus:outline-none focus:border-ink leading-relaxed"
                  />
                </div>

                <div className="flex items-center gap-6 pt-1">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProduct.isFeatured}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })
                      }
                      className="w-4 h-4 rounded-none border border-border"
                    />
                    <span className="font-semibold text-ink"><LocalizedText source={"হোমপেজে ফিচার্ড পণ্য হিসেবে দেখান"} area="admin" /></span>
                  </label>

                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={editingProduct.isFreeDelivery}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, isFreeDelivery: e.target.checked })
                      }
                      className="w-4 h-4 rounded-none border border-border"
                    />
                    <span className="font-semibold text-ink"><LocalizedText source={"ফ্রি ডেলিভারি প্রযোজ্য"} area="admin" /></span>
                  </label>

                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={Boolean(editingProduct.requiresAdvanceCourierCharge)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            requiresAdvanceCourierCharge: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded-none border border-border text-amber-600 focus:ring-amber-500"
                      />
                      <span className="font-semibold text-amber-900 flex items-center gap-1.5">
                        <LocalizedText source={"অগ্রিম কুরিয়ার চার্জ বাধ্যতামূলক"} area="admin" />{" "}<span
                          className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-amber-100 text-amber-800 text-[10px] font-bold cursor-help"
                          title={uiText("এই পণ্যটি কার্টে থাকলে গ্রাহককে সম্পূর্ণ ডেলিভারি চার্জ (ঢাকা ৭০ / ঢাকার বাইরে ১২০) এবং নির্ধারিত ডিপোজিট বিকাশ/নগদ/রকেটে অগ্রিম প্রদান করতে হবে।", locale)}
                        >
                          ⓘ
                        </span>
                      </span>
                    </label>

                    {editingProduct.requiresAdvanceCourierCharge && (
                      <div className="pl-6 p-2.5 rounded border border-amber-200 bg-amber-50/50 space-y-1.5">
                        <label className="block text-[11px] font-bold text-amber-900">
                          <LocalizedText source={"অতিরিক্ত অগ্রিম ডিপোজিট (ঐচ্ছিক ৳ BDT):"} area="admin" />{" "}</label>
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-ink"><LocalizedText source={"৳"} area="admin" /></span>
                          <input
                            type="number"
                            min="0"
                            step="10"
                            value={
                              editingProduct.customAdvanceDepositPoisha
                                ? Math.round(editingProduct.customAdvanceDepositPoisha / 100)
                                : 0
                            }
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                customAdvanceDepositPoisha: (Number(e.target.value) || 0) * 100,
                              })
                            }
                            className="w-36 px-2.5 py-1 text-xs border border-amber-300 rounded bg-white text-ink font-mono font-bold"
                            placeholder="0"
                          />
                          <span className="text-[11px] text-muted">
                            <LocalizedText source={"(ডেলিভারি চার্জের অতিরিক্ত অ্যাডভান্স হিসেবে জমা হবে)"} area="admin" />{" "}</span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Multi-Variant & 3-Tier Poisha Pricing */}
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="font-bold text-ink uppercase text-[11px] tracking-wider text-muted">
                      <LocalizedText source={"২. ভ্যারিয়েন্ট, SKU ও ৩-স্তরীয় প্রাইসিং ম্যাট্রিক্স"} area="admin" />{" "}</h3>
                    <p className="text-[11px] text-muted">
                      <LocalizedText source={"মূল্য হিসাব: (সাপ্লায়ার খরচ + লাভ = প্রদেয়) + প্ল্যাটফর্ম মার্জিন = চূড়ান্ত বিক্রয় মূল্য"} area="admin" />{" "}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const newSku = `BG-${Date.now().toString().slice(-4)}`;
                      setEditingProduct({
                        ...editingProduct,
                        variants: [
                          ...editingProduct.variants,
                          {
                            ...DEFAULT_VARIANT,
                            publicSku: newSku,
                            internalVendorSku: `VND-${newSku}`,
                            titleBn: `ভ্যারিয়েন্ট ${editingProduct.variants.length + 1}`,
                          },
                        ],
                      });
                    }}
                    className="flex items-center gap-1 px-3 py-1.5 bg-surface border border-border text-ink hover:bg-bg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <LocalizedText source={"+ নতুন ভ্যারিয়েন্ট"} area="admin" />{" "}</button>
                </div>

                <div className="space-y-4">
                  {editingProduct.variants.map((variant, vIdx) => {
                    const payableBdt =
                      Number(variant.supplierCostBdt || 0) + Number(variant.supplierProfitBdt || 0);
                    const finalSalePriceBdt =
                      payableBdt + Number(variant.platformMarginBdt || 0);

                    return (
                      <div
                        key={vIdx}
                        className="p-4 bg-bg border border-border space-y-3 relative group"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-border">
                          <span className="font-bold text-ink text-xs">
                            <LocalizedText source={"ভ্যারিয়েন্ট #"} area="admin" />{vIdx + 1}: {variant.titleBn || 'নামহীন'}
                          </span>
                          {editingProduct.variants.length > 1 && (
                            <button
                              type="button"
                              onClick={() => {
                                setEditingProduct({
                                  ...editingProduct,
                                  variants: editingProduct.variants.filter((_, idx) => idx !== vIdx),
                                });
                              }}
                              className="text-danger hover:underline text-[11px] flex items-center gap-1"
                            >
                              <Trash2 className="w-3 h-3" /> {" "}<LocalizedText source={"রিমুভ"} area="admin" />{" "}</button>
                          )}
                        </div>

                        {/* Title, SKUs & Attributes */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"ভ্যারিয়েন্ট নাম (বাংলা)"} area="admin" /></label>
                            <input
                              type="text"
                              required
                              value={variant.titleBn}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].titleBn = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink focus:outline-none focus:border-ink"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"পাবলিক SKU *"} area="admin" /></label>
                            <input
                              type="text"
                              required
                              placeholder="e.g. BG-JAM-01"
                              value={variant.publicSku}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].publicSku = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink font-mono focus:outline-none focus:border-ink"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"ইন্টারনাল ভেন্ডর SKU"} area="admin" /></label>
                            <input
                              type="text"
                              placeholder="e.g. VND-JAM-CRIMSON"
                              value={variant.internalVendorSku}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].internalVendorSku = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink font-mono focus:outline-none focus:border-ink"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"ওজন (গ্রাম) *"} area="admin" /></label>
                            <input
                              type="number"
                              required
                              min={10}
                              value={variant.weightGrams}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].weightGrams = Number(e.target.value);
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink font-mono focus:outline-none focus:border-ink"
                            />
                          </div>
                        </div>

                        {/* 3-Tier Poisha Calculator Fields */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 p-3 bg-surface border border-border text-xs">
                          <div className="space-y-1">
                            <label className="text-[10px] text-muted font-semibold"><LocalizedText source={"১. ভেন্ডর খরচ (৳)"} area="admin" /></label>
                            <input
                              type="number"
                              required
                              min={0}
                              value={variant.supplierCostBdt}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].supplierCostBdt = Number(e.target.value);
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1 bg-bg border border-border text-ink font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-muted font-semibold"><LocalizedText source={"২. ভেন্ডর লাভ (৳)"} area="admin" /></label>
                            <input
                              type="number"
                              required
                              min={0}
                              value={variant.supplierProfitBdt}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].supplierProfitBdt = Number(e.target.value);
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1 bg-bg border border-border text-ink font-mono"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-ink font-bold"><LocalizedText source={"ভেন্ডর প্রদেয় (স্বয়ংক্রিয়)"} area="admin" /></label>
                            <div className="px-2 py-1 bg-bg border border-border text-ink font-mono font-bold">
                              <LocalizedText source={"৳"} area="admin" />{payableBdt}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-success font-semibold"><LocalizedText source={"৩. প্ল্যাটফর্ম লাভ (৳)"} area="admin" /></label>
                            <input
                              type="number"
                              required
                              min={0}
                              value={variant.platformMarginBdt}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].platformMarginBdt = Number(e.target.value);
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1 bg-bg border border-border text-success font-mono font-bold"
                            />
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-accent font-bold"><LocalizedText source={"চূড়ান্ত বিক্রয় মূল্য"} area="admin" /></label>
                            <div className="px-2 py-1 bg-accent/10 border border-accent/30 text-accent font-mono font-bold">
                              <LocalizedText source={"৳"} area="admin" />{finalSalePriceBdt}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label className="text-[10px] text-muted font-semibold"><LocalizedText source={"অন-হ্যান্ড স্টক (পিস)"} area="admin" /></label>
                            <input
                              type="number"
                              required
                              min={0}
                              value={variant.stockOnHand}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].stockOnHand = Number(e.target.value);
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1 bg-bg border border-border text-ink font-mono font-bold"
                            />
                          </div>
                        </div>

                        {/* Image URL & Attributes */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"ভ্যারিয়েন্ট ছবি URL"} area="admin" /></label>
                            <input
                              type="url"
                              placeholder="https://..."
                              value={variant.imageUrl}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].imageUrl = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink font-mono text-[11px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"সাইজ / পরিমাপ"} area="admin" /></label>
                            <input
                              type="text"
                              value={variant.size}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].size = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink text-[11px]"
                            />
                          </div>
                          <div className="space-y-1">
                            <label className="text-[11px] font-semibold text-ink"><LocalizedText source={"রং / শেড"} area="admin" /></label>
                            <input
                              type="text"
                              value={variant.color}
                              onChange={(e) => {
                                const copy = [...editingProduct.variants];
                                copy[vIdx].color = e.target.value;
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2.5 py-1.5 bg-surface border border-border text-ink text-[11px]"
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Product Specs & Gallery */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="font-bold text-ink uppercase text-[11px] tracking-wider text-muted">
                  <LocalizedText source={"৩. ইমেজ গ্যালারি ও স্পেসিফিকেশন টেবিল"} area="admin" />{" "}</h3>

                <div className="space-y-2">
                  <label className="block font-semibold text-ink">
                    {isBn ? 'মোবাইল বা কম্পিউটার থেকে ছবি যোগ করুন' : 'Upload from your phone or computer'}
                    <input type="file" accept="image/jpeg,image/png,image/webp" disabled={isUploading || !editingProduct.productId}
                      className="mt-2 block w-full text-xs" onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void uploadImage(file); event.currentTarget.value = ''; }} />
                  </label>
                  <p className="text-xs text-muted">{!editingProduct.productId
                    ? (isBn ? 'ছবি আপলোডের আগে পণ্যটি ড্রাফট হিসেবে সংরক্ষণ করুন।' : 'Save the product as a draft before uploading images.')
                    : (isBn ? 'JPEG, PNG বা WebP; সর্বোচ্চ ৫ MB। আপলোডের পরে আলাদা অনুমোদন প্রয়োজন।' : 'JPEG, PNG or WebP; maximum 5 MB. Uploaded images require approval.')}</p>
                  {isUploading && <button type="button" onClick={() => uploadController.current?.abort()} className="text-xs underline">{isBn ? 'আপলোড হচ্ছে… বাতিল করুন' : 'Uploading… Cancel'}</button>}
                  <div className="flex flex-wrap gap-3">{stagedImages.filter(image => image.productId === editingProduct.productId).map(image => <div key={image.assetId} className="space-y-1 rounded border border-border p-2">
                    <img src={image.previewUrl} alt={isBn ? 'অনুমোদনের অপেক্ষায় ছবি' : 'Image awaiting approval'} className="h-24 w-24 object-contain" />
                    {userRole === 'super_admin' && <button type="button" disabled={isUploading} onClick={() => void approveImage(image.assetId)} className="text-xs underline">{isBn ? 'পর্যালোচনা শেষে অনুমোদন করুন' : 'Review and approve'}</button>}
                  </div>)}</div>
                  <label className="font-semibold text-ink"><LocalizedText source={"ইমেজ গ্যালারি URL (প্রতি লাইনে একটি বা কমা দিয়ে আলাদা করুন)"} area="admin" /></label>
                  <textarea
                    rows={2}
                    value={imageUrlsDraft}
                    placeholder={isBn ? 'প্রতি লাইনে একটি HTTPS ছবির লিংক' : 'One HTTPS image URL per line'}
                    onChange={(e) => {
                      const value = e.target.value;
                      setImageUrlsDraft(value);
                      setEditingProduct({ ...editingProduct, images: value.split(/[,\n]/).map(s => s.trim()).filter(Boolean) });
                    }}
                    className="w-full px-3 py-2 bg-bg border border-border text-ink font-mono text-[11px]"
                  />
                  <div className="flex gap-2 overflow-x-auto py-1">
                    {editingProduct.images.map((img, i) => (
                      <img
                        key={i}
                        src={productImageUrl(img)}
                        onError={productImageFallback}
                        alt="Preview"
                        className="w-14 h-14 object-cover border border-border"
                      />
                    ))}
                  </div>
                </div>

                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between">
                    <label className="font-semibold text-ink"><LocalizedText source={"পণ্য স্পেক্স (Specifications)"} area="admin" /></label>
                    <button
                      type="button"
                      onClick={() =>
                        setEditingProduct({
                          ...editingProduct,
                          specs: [
                            ...editingProduct.specs,
                            { labelBn: '', labelEn: '', valueBn: '', valueEn: '' },
                          ],
                        })
                      }
                      className="text-xs text-accent hover:underline"
                    >
                      <LocalizedText source={"+ নতুন স্পেক্স ফিল্ড"} area="admin" />{" "}</button>
                  </div>

                  {editingProduct.specs.map((spec, sIdx) => (
                    <div key={sIdx} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                      <input
                        type="text"
                        placeholder={uiText("লেবেল (যেমন: ফেব্রিক)", locale)}
                        value={spec.labelBn}
                        onChange={(e) => {
                          const copy = [...editingProduct.specs];
                          copy[sIdx].labelBn = e.target.value;
                          setEditingProduct({ ...editingProduct, specs: copy });
                        }}
                        className="px-2 py-1 bg-bg border border-border text-ink text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder={uiText("মান (যেমন: হ্যান্ডলুম)", locale)}
                        value={spec.valueBn}
                        onChange={(e) => {
                          const copy = [...editingProduct.specs];
                          copy[sIdx].valueBn = e.target.value;
                          setEditingProduct({ ...editingProduct, specs: copy });
                        }}
                        className="px-2 py-1 bg-bg border border-border text-ink text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder="Label (En)"
                        value={spec.labelEn}
                        onChange={(e) => {
                          const copy = [...editingProduct.specs];
                          copy[sIdx].labelEn = e.target.value;
                          setEditingProduct({ ...editingProduct, specs: copy });
                        }}
                        className="px-2 py-1 bg-bg border border-border text-ink font-mono text-[11px]"
                      />
                      <input
                        type="text"
                        placeholder="Value (En)"
                        value={spec.valueEn}
                        onChange={(e) => {
                          const copy = [...editingProduct.specs];
                          copy[sIdx].valueEn = e.target.value;
                          setEditingProduct({ ...editingProduct, specs: copy });
                        }}
                        className="px-2 py-1 bg-bg border border-border text-ink font-mono text-[11px]"
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-6 border-t border-border flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="px-4 py-2 bg-surface text-ink border border-border hover:bg-bg transition-colors"
                >
                  <LocalizedText source={"বাতিল করুন"} area="admin" />{" "}</button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-6 py-2 bg-ink text-bg font-bold border border-ink hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSaving ? 'সংরক্ষণ হচ্ছে...' : 'পণ্য ও ভ্যারিয়েন্ট সংরক্ষণ করুন'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Product fields from the current workspace snapshot, not a live integration test. */}
      {inspectProduct && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div role="dialog" aria-modal="true" aria-label={isBn ? 'পণ্য সংযোগের তথ্য' : 'Product linkage details'} className="w-full max-w-3xl bg-surface border border-border p-4 sm:p-6 space-y-4 max-h-[calc(100dvh-2rem)] overflow-y-auto">
            <h2 className="font-bold">{localizedField(inspectProduct, "nameBn", locale)}</h2>
            <p className="text-xs text-muted">{isBn ? 'এগুলো বর্তমান পণ্যের সংরক্ষিত তথ্য; অন্যান্য সেবার কার্যকারিতা নিশ্চিত করে না।' : 'These are fields from the current product snapshot; they do not verify downstream services.'}</p>
            <p className="text-sm">{isBn ? 'ভেন্ডর আইডি' : 'Vendor ID'}: {inspectProduct.vendorId}</p>
            <p className="text-sm">{isBn ? 'ক্যাটাগরি আইডি' : 'Category ID'}: {inspectProduct.categoryId}</p>
            {inspectProduct.variants.map(variant => <div key={variant.variantId} className="border border-border p-3 text-xs space-y-1">
              <p className="font-bold">{isBn ? variant.titleBn : variant.titleEn}</p>
              <p>{isBn ? 'পাবলিক SKU' : 'Public SKU'}: {variant.publicSku}</p>
              <p>{isBn ? 'অন-হ্যান্ড স্টক' : 'Stock on hand'}: {formatLocaleNumber(variant.stockOnHand, locale)}</p>
              <p>{isBn ? 'রিজার্ভড স্টক' : 'Reserved stock'}: {formatLocaleNumber(variant.stockReserved, locale)}</p>
              <p>{isBn ? 'ওজন (গ্রাম)' : 'Weight (grams)'}: {formatLocaleNumber(variant.weightGrams, locale)}</p>
            </div>)}
            <button type="button" onClick={() => setInspectProduct(null)} className="px-4 py-2 bg-ink text-bg font-bold text-xs">{isBn ? 'বন্ধ করুন' : 'Close'}</button>
          </div>
        </div>
      )}

      {/* CATEGORY ADD/EDIT MODAL */}
      {isCategoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto bg-surface border border-border p-4 sm:p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="font-bold text-ink text-sm">
                {categoryFormData.id ? 'ক্যাটাগরি এডিট করুন' : 'নতুন ক্যাটাগরি তৈরি করুন'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCategoryModalOpen(false)}
                className="p-1 text-muted hover:text-ink"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label className="font-semibold text-ink"><LocalizedText source={"ক্যাটাগরি নাম (বাংলা) *"} area="admin" /></label>
                <input
                  type="text"
                  required
                  placeholder={uiText("যেমন: ঐতিহ্যবাহী পোশাক", locale)}
                  value={categoryFormData.nameBn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, nameBn: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-bg border border-border text-ink"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-ink"><LocalizedText source={"Category Name (English) *"} area="admin" /></label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Traditional Clothing"
                  value={categoryFormData.nameEn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, nameEn: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-bg border border-border text-ink font-mono"
                />
              </div>

              <div className="space-y-1">
                <label className="font-semibold text-ink"><LocalizedText source={"বিবরণ (বাংলা) *"} area="admin" /></label>
                <textarea
                  rows={2}
                  required
                  value={categoryFormData.descriptionBn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, descriptionBn: e.target.value })
                  }
                  className="w-full px-3 py-2 bg-bg border border-border text-ink"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="font-semibold text-ink"><LocalizedText source={"ক্রমবিন্যাস (Sort Order)"} area="admin" /></label>
                  <input
                    type="number"
                    min={1}
                    value={categoryFormData.sortOrder}
                    onChange={(e) =>
                      setCategoryFormData({ ...categoryFormData, sortOrder: Number(e.target.value) })
                    }
                    className="w-full px-3 py-2 bg-bg border border-border text-ink font-mono"
                  />
                </div>

                <div className="space-y-1">
                  <label className="font-semibold text-ink"><LocalizedText source={"আইকন প্রতীক"} area="admin" /></label>
                  <input
                    type="text"
                    value={categoryFormData.iconName}
                    onChange={(e) =>
                      setCategoryFormData({ ...categoryFormData, iconName: e.target.value })
                    }
                    className="w-full px-3 py-2 bg-bg border border-border text-ink font-mono"
                  />
                </div>
              </div>

              <label className="flex items-center gap-2 cursor-pointer pt-1">
                <input
                  type="checkbox"
                  checked={categoryFormData.isActive}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, isActive: e.target.checked })
                  }
                  className="w-4 h-4 rounded-none border border-border"
                />
                <span className="font-semibold text-ink"><LocalizedText source={"স্টোরফ্রন্টে এই ক্যাটাগরি দৃশ্যমান রাখুন"} area="admin" /></span>
              </label>

              <div className="pt-4 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="px-3 py-1.5 bg-surface text-ink border border-border"
                >
                  <LocalizedText source={"বাতিল"} area="admin" />{" "}</button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-ink text-bg font-bold border border-ink"
                >
                  <LocalizedText source={"সংরক্ষণ করুন"} area="admin" />{" "}</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
