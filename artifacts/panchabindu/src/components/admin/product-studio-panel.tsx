'use client';

import React, { useState, useMemo, useId, useEffect, useRef } from 'react';
import {
  Package,
  Plus,
  Edit2,
  Trash2,
  Search,
  Layers,
  TrendingUp,
  X,
  Archive,
} from 'lucide-react';
import { adminFetch as fetch } from '@/lib/admin/admin-fetch';
import { productImageUrl, productImageFallback } from '@/lib/storefront/product-image';
import { CatalogImportPanel } from './catalog-import-panel';
import type { InternalProductRecord, CategoryRecord } from '@/lib/db/repository';
import type { VendorProfileRecord, DistrictRateOverrideRecord } from '@/lib/admin/phase4b-service';
import type { OrderGridRowDTO } from '@/types/domain';
import type { ModeratedReviewItemDTO } from '@/lib/admin/phase6-service';
import { formatPoishaToBdt, parseTakaStringToPoisha } from '@/lib/money';
import { formatLocaleDateTime, formatLocaleNumber } from '@/lib/i18n/dictionaries';
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
  moderatedReviews?: ModeratedReviewItemDTO[];
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

const INPUT_CLASS =
  'w-full px-3 py-2 bg-bg border border-border text-ink text-base lg:text-xs focus:outline-none focus:border-ink';

const VARIANT_INPUT_CLASS =
  'w-full px-2.5 py-1.5 bg-surface border border-border text-ink text-base lg:text-xs focus:outline-none focus:border-ink';

export function ProductManagementStudioPanel({
  products,
  categories,
  vendors,
  moderatedReviews = [],
  onRefresh,
  userRole,
  locale: propLocale,
}: ProductStudioPanelProps) {
  const idPrefix = useId();
  const storeLocale = useLocaleStore((s) => s.adminLocale);
  const locale = propLocale ?? storeLocale ?? 'en';
  const isBn = locale === 'bn';
  const isSuperAdmin = userRole === 'super_admin';
  const canModerateReviews = userRole === 'super_admin' || userRole === 'marketing_manager';

  const [activeTab, setActiveTab] = useState<'products' | 'categories' | 'reviews' | 'connectivity'>('products');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [moderatingReviewId, setModeratingReviewId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('all');
  const [selectedVendorFilter, setSelectedVendorFilter] = useState<string>('all');
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');

  // Feedback banner
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Editor Drawer State
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductFormData | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [imageUrlsDraft, setImageUrlsDraft] = useState('');
  const [stagedImages, setStagedImages] = useState<
    Array<{ assetId: string; productId: string; previewUrl: string }>
  >([]);
  const uploadController = useRef<AbortController | null>(null);
  useEffect(() => () => uploadController.current?.abort(), []);

  // Product linkage inspector state
  const [inspectProduct, setInspectProduct] = useState<InternalProductRecord | null>(null);

  // Archive Confirmation Modal State
  const [archiveTarget, setArchiveTarget] = useState<InternalProductRecord | null>(null);
  const [isArchiving, setIsArchiving] = useState(false);

  // Category Editor Modal State
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [isSavingCategory, setIsSavingCategory] = useState(false);
  const [categoryError, setCategoryError] = useState<string | null>(null);
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

  // Measure sticky preview banner height so no modal or drawer clips under it
  const anyStudioDialogOpen =
    isEditorOpen || Boolean(inspectProduct) || isCategoryModalOpen || Boolean(archiveTarget);
  const [bannerOffsetPx, setBannerOffsetPx] = useState(0);

  useEffect(() => {
    if (typeof window === 'undefined' || !anyStudioDialogOpen) return undefined;
    const measureBanner = () => {
      const banner = document.querySelector('body > [role="status"]') as HTMLElement | null;
      if (!banner) {
        setBannerOffsetPx(0);
        return;
      }
      const rect = banner.getBoundingClientRect();
      const visibleBottom = Math.max(0, Math.min(Math.ceil(rect.height), Math.ceil(rect.bottom)));
      setBannerOffsetPx(visibleBottom);
    };
    measureBanner();
    window.addEventListener('resize', measureBanner);
    window.addEventListener('scroll', measureBanner, { passive: true });
    return () => {
      window.removeEventListener('resize', measureBanner);
      window.removeEventListener('scroll', measureBanner);
    };
  }, [anyStudioDialogOpen]);

  // Escape closes top-most open dialog
  useEffect(() => {
    if (!anyStudioDialogOpen) return undefined;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (archiveTarget && !isArchiving) setArchiveTarget(null);
      else if (isCategoryModalOpen && !isSavingCategory) setIsCategoryModalOpen(false);
      else if (inspectProduct) setInspectProduct(null);
      else if (isEditorOpen && !isSaving) setIsEditorOpen(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [
    anyStudioDialogOpen,
    archiveTarget,
    isArchiving,
    isCategoryModalOpen,
    isSavingCategory,
    inspectProduct,
    isEditorOpen,
    isSaving,
  ]);

  const hasActiveFilters =
    Boolean(searchQuery.trim()) ||
    selectedCategoryFilter !== 'all' ||
    selectedVendorFilter !== 'all' ||
    selectedStatusFilter !== 'all';

  const clearFilters = () => {
    setSearchQuery('');
    setSelectedCategoryFilter('all');
    setSelectedVendorFilter('all');
    setSelectedStatusFilter('all');
  };

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

  const filteredReviews = useMemo(
    () =>
      moderatedReviews.filter(
        (r) => reviewFilter === 'all' || r.moderationStatus === reviewFilter
      ),
    [moderatedReviews, reviewFilter]
  );

  const uploadImage = async (file: File) => {
    if (!editingProduct?.productId) return;
    setIsUploading(true);
    setEditorError(null);
    const controller = new AbortController();
    uploadController.current = controller;
    try {
      const body = new FormData();
      body.set('productId', editingProduct.productId);
      body.set('file', file);
      const response = await fetch('/api/media', { method: 'POST', body, signal: controller.signal });
      const data = await response.json();
      if (!response.ok || !data.success) {
        throw new Error(
          data.code === 'STORAGE_NOT_CONFIGURED'
            ? isBn
              ? 'আপলোড স্টোরেজ কনফিগার করা নেই। সরাসরি HTTPS ছবির লিংক ব্যবহার করুন।'
              : 'Upload storage is not configured. Use a direct HTTPS image URL.'
            : isBn
            ? 'ছবি আপলোড হয়নি। ফাইল ও স্টোরেজ সংযোগ যাচাই করুন।'
            : 'Upload failed. Check the file and storage connection.'
        );
      }
      const previewResponse = await fetch(`/api/media/${data.assetId}`);
      const preview = await previewResponse.json();
      if (!previewResponse.ok || !preview.previewUrl) {
        throw new Error(isBn ? 'ছবির প্রিভিউ পাওয়া যায়নি।' : 'The image preview is unavailable.');
      }
      setStagedImages((images) => [
        ...images.filter((image) => image.assetId !== data.assetId),
        { assetId: data.assetId, productId: editingProduct.productId!, previewUrl: preview.previewUrl },
      ]);
    } catch (error) {
      if (!(error instanceof Error && error.name === 'AbortError')) {
        setEditorError(
          error instanceof Error
            ? error.message
            : isBn
            ? 'ছবি আপলোড ব্যর্থ হয়েছে।'
            : 'Image upload failed.'
        );
      }
    } finally {
      setIsUploading(false);
    }
  };

  const approveImage = async (assetId: string) => {
    setIsUploading(true);
    setEditorError(null);
    try {
      const response = await fetch(`/api/media/${assetId}`, { method: 'POST' });
      const data = await response.json();
      if (!response.ok || !data.success || !data.url) {
        throw new Error(isBn ? 'ছবির অনুমোদন ব্যর্থ হয়েছে।' : 'Unable to approve this image.');
      }
      setEditingProduct((product) =>
        product
          ? { ...product, images: [data.url, ...product.images.filter((image) => image !== data.url)] }
          : product
      );
      setImageUrlsDraft((current) =>
        [data.url, ...current.split(/[,\n]/).map((v) => v.trim()).filter((v) => v && v !== data.url)].join(
          '\n'
        )
      );
      setStagedImages((images) => images.filter((image) => image.assetId !== assetId));
      await onRefresh();
    } catch (error) {
      setEditorError(
        error instanceof Error
          ? error.message
          : isBn
          ? 'অনুমোদন ব্যর্থ হয়েছে।'
          : 'Approval failed.'
      );
    } finally {
      setIsUploading(false);
    }
  };

  const loadPendingImages = async (productId: string) => {
    try {
      const response = await fetch(`/api/media?productId=${encodeURIComponent(productId)}`);
      if (!response.ok) return;
      const data = await response.json();
      if (data.success && Array.isArray(data.assets)) {
        setStagedImages((previous) => [
          ...previous.filter((image) => image.productId !== productId),
          ...data.assets.filter((asset: { previewUrl?: string }) => asset.previewUrl),
        ]);
      }
    } catch {
      /* Editing by URL remains available without storage. */
    }
  };

  const handleAddNewProduct = () => {
    setEditorError(null);
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

  const handleEditProduct = (prod: InternalProductRecord) => {
    setEditorError(null);
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
      specs: prod.specs && prod.specs.length > 0 ? prod.specs.map((s) => ({ ...s })) : [],
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

  const handleSaveProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct || isSaving) return;
    setIsSaving(true);
    setEditorError(null);
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
          titleEn: v.titleEn || v.titleBn,
          attributes: { সাইজ: v.size, রং: v.color },
          imageUrl: v.imageUrl || null,
          supplierCostPoisha: costPoisha,
          supplierProfitPoisha: profitPoisha,
          supplierPayablePoisha: payablePoisha,
          platformMarginPoisha: marginPoisha,
          salePricePoisha,
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
            descriptionEn: editingProduct.descriptionEn || editingProduct.descriptionBn,
            isFeatured: editingProduct.isFeatured,
            isFreeDelivery: editingProduct.isFreeDelivery,
            requiresAdvanceCourierCharge: Boolean(editingProduct.requiresAdvanceCourierCharge),
            customAdvanceDepositPoisha: Number(editingProduct.customAdvanceDepositPoisha) || 0,
            lowStockThreshold: Number(editingProduct.lowStockThreshold) || 5,
            leadTimeDays: Number(editingProduct.leadTimeDays) || 2,
            status: editingProduct.status,
            images: editingProduct.images.filter(Boolean),
            specs: editingProduct.specs.filter((s) => s.labelBn.trim() && s.valueBn.trim()),
            variants: payloadVariants,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(
          isBn
            ? data.errorBn || 'পণ্য সংরক্ষণ করা সম্ভব হয়নি।'
            : data.errorEn || data.errorBn || 'Failed to save product.'
        );
      }

      setFeedbackMsg({
        type: 'success',
        text: isBn
          ? 'পণ্য সফলভাবে ক্যাটালগে সংরক্ষিত হয়েছে।'
          : 'Product saved to the catalog.',
      });
      setIsEditorOpen(false);
      await onRefresh();
    } catch (err: unknown) {
      setEditorError(
        err instanceof Error
          ? err.message
          : isBn
          ? 'পণ্য সংরক্ষণে ত্রুটি ঘটেছে।'
          : 'An error occurred while saving the product.'
      );
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmArchiveProduct = async () => {
    if (!archiveTarget || isArchiving) return;
    setIsArchiving(true);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'delete_product',
          productId: archiveTarget.productId,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setFeedbackMsg({
          type: 'error',
          text: isBn
            ? data.errorBn || 'পণ্য আর্কাইভ করা সম্ভব হয়নি।'
            : data.errorEn || data.errorBn || 'Failed to archive product.',
        });
      } else {
        setFeedbackMsg({
          type: 'success',
          text: isBn
            ? 'পণ্য আর্কাইভ করা হয়েছে। পূর্বের অর্ডার ও স্টক ইতিহাস সংরক্ষিত আছে।'
            : 'Product archived. Past order and stock history has been preserved.',
        });
        setArchiveTarget(null);
        await onRefresh();
      }
    } catch {
      setFeedbackMsg({
        type: 'error',
        text: isBn ? 'সার্ভারে ত্রুটি হয়েছে।' : 'Server error while archiving product.',
      });
    } finally {
      setIsArchiving(false);
    }
  };

  const openCategoryModal = (cat?: CategoryRecord) => {
    setCategoryError(null);
    if (cat) {
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
    } else {
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
    }
    setIsCategoryModalOpen(true);
  };

  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSavingCategory) return;
    setIsSavingCategory(true);
    setCategoryError(null);
    setFeedbackMsg(null);
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
            descriptionEn: categoryFormData.descriptionEn || categoryFormData.descriptionBn,
            iconName: categoryFormData.iconName,
            sortOrder: Number(categoryFormData.sortOrder) || 1,
            isActive: categoryFormData.isActive,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setCategoryError(
          isBn
            ? data.errorBn || 'ক্যাটাগরি সংরক্ষণ ব্যর্থ হয়েছে।'
            : data.errorEn || data.errorBn || 'Failed to save category.'
        );
      } else {
        setIsCategoryModalOpen(false);
        setFeedbackMsg({
          type: 'success',
          text: isBn ? 'ক্যাটাগরি সফলভাবে সংরক্ষিত হয়েছে।' : 'Category saved.',
        });
        await onRefresh();
      }
    } catch {
      setCategoryError(isBn ? 'সার্ভারে ত্রুটি হয়েছে।' : 'Server error while saving category.');
    } finally {
      setIsSavingCategory(false);
    }
  };

  const handleModerateReview = async (reviewId: string, decision: 'approved' | 'rejected') => {
    if (moderatingReviewId) return;
    setModeratingReviewId(reviewId);
    setFeedbackMsg(null);
    try {
      const res = await fetch('/api/admin/workspace', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          operation: 'moderate_product_review',
          reviewId,
          decision,
        }),
      });
      const data = (await res.json()) as { success?: boolean; errorBn?: string; errorEn?: string };
      if (!res.ok || !data.success) {
        setFeedbackMsg({
          type: 'error',
          text: isBn
            ? data.errorBn || 'রিভিউ আপডেট ব্যর্থ।'
            : data.errorEn || data.errorBn || 'Failed to update review.',
        });
      } else {
        setFeedbackMsg({
          type: 'success',
          text:
            decision === 'approved'
              ? isBn
                ? 'রিভিউ অনুমোদিত হয়েছে।'
                : 'Review approved.'
              : isBn
              ? 'রিভিউ প্রত্যাখ্যাত হয়েছে।'
              : 'Review rejected.',
        });
        await onRefresh();
      }
    } catch {
      setFeedbackMsg({
        type: 'error',
        text: isBn ? 'সার্ভারে ত্রুটি হয়েছে।' : 'Server error while updating review.',
      });
    } finally {
      setModeratingReviewId(null);
    }
  };

  const inspectVendor = inspectProduct
    ? vendors.find((v) => v.vendorId === inspectProduct.vendorId)
    : undefined;
  const inspectCategory = inspectProduct
    ? categories.find((c) => c.id === inspectProduct.categoryId)
    : undefined;

  return (
    <div className="space-y-6">
      {isSuperAdmin && <CatalogImportPanel locale={locale} onComplete={onRefresh} />}

      {/* Top Banner & Primary Actions */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 bg-surface border border-border">
        <div className="flex items-center gap-2">
          <span className="p-2 bg-bg border border-border text-ink" aria-hidden="true">
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

        {isSuperAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleAddNewProduct}
              className="flex min-h-11 items-center gap-1.5 px-4 py-2 bg-ink text-bg font-semibold text-xs border border-ink hover:opacity-90 transition-opacity"
            >
              <Plus className="w-4 h-4" aria-hidden="true" />
              {isBn ? 'নতুন পণ্য যোগ করুন' : 'Add New Product'}
            </button>
            <button
              type="button"
              onClick={() => openCategoryModal()}
              className="flex min-h-11 items-center gap-1.5 px-3 py-2 bg-surface text-ink text-xs font-semibold border border-border hover:bg-bg transition-colors"
            >
              <Layers className="w-4 h-4 text-muted" aria-hidden="true" />
              {isBn ? 'ক্যাটাগরি যোগ করুন' : 'Add Category'}
            </button>
          </div>
        )}
      </div>

      {feedbackMsg && (
        <div
          role={feedbackMsg.type === 'error' ? 'alert' : 'status'}
          className={`flex items-center justify-between gap-3 p-3 text-xs font-medium border ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
              : 'bg-danger/10 border-danger/30 text-danger'
          }`}
        >
          <span>{feedbackMsg.text}</span>
          <button
            type="button"
            onClick={() => setFeedbackMsg(null)}
            aria-label={isBn ? 'বার্তা বন্ধ করুন' : 'Dismiss message'}
            className="min-h-8 min-w-8 flex items-center justify-center shrink-0 hover:opacity-80"
          >
            <X className="w-4 h-4" aria-hidden="true" />
          </button>
        </div>
      )}

      {/* Main Sub Tabs */}
      <div
        role="tablist"
        aria-label={isBn ? 'প্রোডাক্ট স্টুডিও বিভাগসমূহ' : 'Product Studio sections'}
        className="flex flex-wrap border-b border-border text-xs font-medium"
      >
        <button
          id={`${idPrefix}-tab-products`}
          role="tab"
          type="button"
          aria-selected={activeTab === 'products'}
          aria-controls={`${idPrefix}-panel-products`}
          onClick={() => setActiveTab('products')}
          className={`min-h-11 max-w-full px-4 py-2.5 border-b-2 text-left transition-colors ${
            activeTab === 'products'
              ? 'border-ink text-ink font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {isBn ? 'সকল পণ্য ক্যাটালগ' : 'All Products Catalog'} ({formatLocaleNumber(products.length, locale)})
        </button>
        <button
          id={`${idPrefix}-tab-categories`}
          role="tab"
          type="button"
          aria-selected={activeTab === 'categories'}
          aria-controls={`${idPrefix}-panel-categories`}
          onClick={() => setActiveTab('categories')}
          className={`min-h-11 max-w-full px-4 py-2.5 border-b-2 text-left transition-colors ${
            activeTab === 'categories'
              ? 'border-ink text-ink font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {isBn ? 'ক্যাটাগরি ম্যানেজার' : 'Category Manager'} ({formatLocaleNumber(categories.length, locale)})
        </button>
        <button
          id={`${idPrefix}-tab-reviews`}
          role="tab"
          type="button"
          aria-selected={activeTab === 'reviews'}
          aria-controls={`${idPrefix}-panel-reviews`}
          onClick={() => setActiveTab('reviews')}
          className={`min-h-11 max-w-full px-4 py-2.5 border-b-2 text-left transition-colors ${
            activeTab === 'reviews'
              ? 'border-ink text-ink font-bold'
              : 'border-transparent text-muted hover:text-ink'
          }`}
        >
          {isBn ? 'রিভিউ মডারেশন' : 'Review Moderation'} ({formatLocaleNumber(moderatedReviews.length, locale)})
        </button>
        <button
          id={`${idPrefix}-tab-connectivity`}
          role="tab"
          type="button"
          aria-selected={activeTab === 'connectivity'}
          aria-controls={`${idPrefix}-panel-connectivity`}
          onClick={() => setActiveTab('connectivity')}
          className={`min-h-11 max-w-full px-4 py-2.5 border-b-2 text-left transition-colors ${
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
        <div
          id={`${idPrefix}-panel-products`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-products`}
          className="space-y-4"
        >
          {/* Filter Bar */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3 p-3 bg-surface border border-border">
            <div className="relative">
              <label htmlFor={`${idPrefix}-filter-search`} className="sr-only">
                {isBn ? 'নাম বা SKU দিয়ে সার্চ করুন' : 'Search by name or SKU'}
              </label>
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden="true" />
              <input
                id={`${idPrefix}-filter-search`}
                type="text"
                placeholder={isBn ? 'নাম বা SKU দিয়ে সার্চ করুন...' : 'Search by name or SKU...'}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full min-h-11 pl-9 pr-3 py-2 bg-bg border border-border text-ink text-base lg:text-xs focus:outline-none focus:border-ink"
              />
            </div>

            <div>
              <label htmlFor={`${idPrefix}-filter-category`} className="sr-only">
                {isBn ? 'ক্যাটাগরি ফিল্টার' : 'Filter by category'}
              </label>
              <select
                id={`${idPrefix}-filter-category`}
                value={selectedCategoryFilter}
                onChange={(e) => setSelectedCategoryFilter(e.target.value)}
                className="w-full min-h-11 px-3 py-2 bg-bg border border-border text-ink text-base lg:text-xs focus:outline-none focus:border-ink"
              >
                <option value="all">{isBn ? 'সকল ক্যাটাগরি' : 'All Categories'}</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {isBn ? c.nameBn : c.nameEn} ({isBn ? c.nameEn : c.nameBn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${idPrefix}-filter-vendor`} className="sr-only">
                {isBn ? 'ভেন্ডর ফিল্টার' : 'Filter by vendor'}
              </label>
              <select
                id={`${idPrefix}-filter-vendor`}
                value={selectedVendorFilter}
                onChange={(e) => setSelectedVendorFilter(e.target.value)}
                className="w-full min-h-11 px-3 py-2 bg-bg border border-border text-ink text-base lg:text-xs focus:outline-none focus:border-ink"
              >
                <option value="all">{isBn ? 'সকল ভেন্ডর' : 'All Vendors'}</option>
                {vendors.map((v) => (
                  <option key={v.vendorId} value={v.vendorId}>
                    {isBn ? v.businessNameBn : v.businessNameEn} ({isBn ? v.businessNameEn : v.businessNameBn})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label htmlFor={`${idPrefix}-filter-status`} className="sr-only">
                {isBn ? 'স্ট্যাটাস ফিল্টার' : 'Filter by status'}
              </label>
              <select
                id={`${idPrefix}-filter-status`}
                value={selectedStatusFilter}
                onChange={(e) => setSelectedStatusFilter(e.target.value)}
                className="w-full min-h-11 px-3 py-2 bg-bg border border-border text-ink text-base lg:text-xs focus:outline-none focus:border-ink"
              >
                <option value="all">{isBn ? 'সকল স্ট্যাটাস' : 'All Statuses'}</option>
                <option value="active">{isBn ? 'সক্রিয় (Active)' : 'Active'}</option>
                <option value="draft">{isBn ? 'ড্রাফট (Draft)' : 'Draft'}</option>
                <option value="archived">{isBn ? 'আর্কাইভড (Archived)' : 'Archived'}</option>
              </select>
            </div>
          </div>

          {/* Product Table */}
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
                    <td colSpan={7} className="p-8 text-center text-muted space-y-3">
                      <p>
                        {hasActiveFilters
                          ? isBn
                            ? 'বর্তমান ফিল্টারে কোনো পণ্য পাওয়া যায়নি।'
                            : 'No products match the current filters.'
                          : isBn
                          ? 'কোনো পণ্য পাওয়া যায়নি। নতুন পণ্য যোগ করুন।'
                          : 'No products found in the catalog yet.'}
                      </p>
                      {hasActiveFilters && (
                        <button
                          type="button"
                          onClick={clearFilters}
                          className="inline-flex min-h-11 items-center px-4 py-2 bg-bg border border-border text-ink font-semibold text-xs hover:border-ink"
                        >
                          {isBn ? 'ফিল্টার রিসেট করুন' : 'Clear filters'}
                        </button>
                      )}
                    </td>
                  </tr>
                ) : (
                  filteredProducts.map((p) => {
                    const primaryVariant = p.variants[0];
                    const category = categories.find((c) => c.id === p.categoryId);
                    const vendor = vendors.find((v) => v.vendorId === p.vendorId);
                    const totalStock = p.variants.reduce((sum, v) => sum + (v.stockOnHand || 0), 0);
                    const totalReserved = p.variants.reduce((sum, v) => sum + (v.stockReserved || 0), 0);
                    const isLowStock = totalStock <= p.lowStockThreshold;
                    const displayTitle = isBn ? p.nameBn : p.nameEn || p.nameBn;
                    const variantCountLabel = isBn
                      ? `${formatLocaleNumber(p.variants.length, locale)} টি ভ্যারিয়েন্ট`
                      : `${formatLocaleNumber(p.variants.length, locale)} ${
                          p.variants.length === 1 ? 'variant' : 'variants'
                        }`;

                    return (
                      <tr key={p.productId} className="hover:bg-bg/50 transition-colors">
                        <td className="p-3 align-top min-w-[200px]">
                          <div className="flex items-start gap-2.5">
                            <div className="w-12 h-12 shrink-0 bg-bg border border-border overflow-hidden">
                              {p.images && p.images[0] ? (
                                <img
                                  src={productImageUrl(p.images[0])}
                                  onError={productImageFallback}
                                  alt={displayTitle}
                                  className="w-full h-full object-cover"
                                />
                              ) : (
                                <div className="w-full h-full flex items-center justify-center text-muted">
                                  <Package className="w-4 h-4" aria-hidden="true" />
                                </div>
                              )}
                            </div>
                            <div className="space-y-0.5">
                              <p className="font-bold text-ink">{displayTitle}</p>
                              <p className="text-[11px] text-muted font-mono">
                                {isBn ? p.nameEn : p.nameBn}
                              </p>
                              <div className="flex flex-wrap items-center gap-1.5 pt-1">
                                <span
                                  className={`px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide border ${
                                    p.status === 'active'
                                      ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                      : p.status === 'draft'
                                      ? 'bg-amber-50 text-amber-900 border-amber-300'
                                      : 'bg-bg text-muted border-border'
                                  }`}
                                >
                                  {p.status}
                                </span>
                                {p.isFeatured && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-bg text-ink border border-border">
                                    {isBn ? 'নির্বাচিত' : 'Featured'}
                                  </span>
                                )}
                                {p.isFreeDelivery && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-sky-50 text-sky-900 border border-sky-300">
                                    {isBn ? 'ফ্রি ডেলিভারি' : 'Free Delivery'}
                                  </span>
                                )}
                                {p.requiresAdvanceCourierCharge && (
                                  <span className="px-1.5 py-0.5 text-[10px] font-bold bg-amber-50 text-amber-900 border border-amber-300">
                                    {isBn ? 'অগ্রিম কুরিয়ার চার্জ' : 'Advance Courier'}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                        </td>

                        <td className="p-3 align-top">
                          <p className="font-semibold text-ink">
                            {category ? (isBn ? category.nameBn : category.nameEn) : p.categoryId}
                          </p>
                          <p className="text-[11px] text-muted">
                            {vendor
                              ? isBn
                                ? vendor.businessNameBn
                                : vendor.businessNameEn
                              : p.vendorBusinessName}
                          </p>
                          <p className="text-[10px] font-mono text-muted">
                            {isBn ? 'আইডি:' : 'ID:'} {p.vendorCode}
                          </p>
                        </td>

                        <td className="p-3 align-top min-w-[150px]">
                          <span className="font-bold text-ink">{variantCountLabel}</span>
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
                                {isBn
                                  ? `+ আরও ${formatLocaleNumber(p.variants.length - 2, locale)}টি ভ্যারিয়েন্ট`
                                  : `+ ${formatLocaleNumber(p.variants.length - 2, locale)} more ${
                                      p.variants.length - 2 === 1 ? 'variant' : 'variants'
                                    }`}
                              </span>
                            )}
                          </div>
                        </td>

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
                              <div className="flex justify-between text-emerald-800 font-medium">
                                <span>{isBn ? 'প্ল্যাটফর্ম মার্জিন:' : 'Platform Margin:'}</span>
                                <span>+{formatPoishaToBdt(primaryVariant.platformMarginPoisha, locale)}</span>
                              </div>
                              <div className="flex justify-between font-bold text-ink pt-0.5 border-t border-border text-xs">
                                <span>{isBn ? 'খুচরা বিক্রয় মূল্য:' : 'Retail Sale Price:'}</span>
                                <span className="text-ink">
                                  {formatPoishaToBdt(primaryVariant.salePricePoisha, locale)}
                                </span>
                              </div>
                            </div>
                          )}
                        </td>

                        <td className="p-3 align-top">
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <span
                                aria-hidden="true"
                                className={`w-2 h-2 rounded-full ${
                                  totalStock === 0
                                    ? 'bg-danger'
                                    : isLowStock
                                    ? 'bg-amber-600'
                                    : 'bg-emerald-700'
                                }`}
                              />
                              <span className="font-bold text-ink">
                                {formatLocaleNumber(totalStock, locale)} {isBn ? 'পিস' : 'pcs'}
                              </span>
                            </div>
                            <p className="text-[10px] text-muted">
                              {isBn ? 'রিজার্ভড:' : 'Reserved:'}{' '}
                              {formatLocaleNumber(totalReserved, locale)} {isBn ? 'পিস' : 'pcs'}
                            </p>
                            {isLowStock && (
                              <span className="inline-block text-[10px] font-bold text-amber-900 border border-amber-300 bg-amber-50 px-1 py-0.5">
                                {isBn ? 'লো স্টক অ্যালার্ট' : 'Low Stock Alert'}
                              </span>
                            )}
                          </div>
                        </td>

                        <td className="p-3 align-top">
                          <p className="font-mono font-semibold text-ink">
                            {`${formatLocaleNumber(primaryVariant?.weightGrams ?? 500, locale)} ${
                              isBn ? 'গ্রাম' : 'g'
                            }`}
                          </p>
                          <p className="text-[10px] text-muted">
                            {isBn ? 'ঢাকা: ৳৭০ | ঢাকার বাইরে: ৳১৩০' : 'Dhaka: ৳70 | Outside: ৳130'}
                          </p>
                          {(primaryVariant?.weightGrams ?? 500) > 1000 && (
                            <span className="text-[10px] text-amber-900 font-semibold">
                              {isBn ? '+৳২০/কেজি অতিরিক্ত চার্জ' : '+৳20/kg extra charge'}
                            </span>
                          )}
                        </td>

                        <td className="p-3 align-top text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              title={isBn ? 'পণ্যের সংযোগের তথ্য দেখুন' : 'View product linkage details'}
                              aria-label={
                                isBn
                                  ? `${displayTitle} এর সংযোগের তথ্য দেখুন`
                                  : `View linkage details for ${displayTitle}`
                              }
                              onClick={() => setInspectProduct(p)}
                              className="min-h-11 min-w-11 inline-flex items-center justify-center bg-bg border border-border text-ink hover:border-ink transition-colors"
                            >
                              <TrendingUp className="w-4 h-4 text-accent" aria-hidden="true" />
                            </button>
                            {isSuperAdmin && (
                              <>
                                <button
                                  type="button"
                                  title={isBn ? 'পণ্য এডিট করুন' : 'Edit product'}
                                  aria-label={
                                    isBn ? `${displayTitle} এডিট করুন` : `Edit ${displayTitle}`
                                  }
                                  onClick={() => handleEditProduct(p)}
                                  className="min-h-11 min-w-11 inline-flex items-center justify-center bg-bg border border-border text-ink hover:border-ink transition-colors"
                                >
                                  <Edit2 className="w-4 h-4" aria-hidden="true" />
                                </button>
                                <button
                                  type="button"
                                  disabled={p.status === 'archived'}
                                  title={
                                    p.status === 'archived'
                                      ? isBn
                                        ? 'ইতিমধ্যে আর্কাইভড'
                                        : 'Already archived'
                                      : isBn
                                      ? 'পণ্য আর্কাইভ করুন'
                                      : 'Archive product'
                                  }
                                  aria-label={
                                    isBn
                                      ? `${displayTitle} আর্কাইভ করুন`
                                      : `Archive ${displayTitle}`
                                  }
                                  onClick={() => setArchiveTarget(p)}
                                  className="min-h-11 min-w-11 inline-flex items-center justify-center bg-bg border border-border text-danger hover:border-danger disabled:opacity-40 transition-colors"
                                >
                                  <Archive className="w-4 h-4" aria-hidden="true" />
                                </button>
                              </>
                            )}
                          </div>
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
        <div
          id={`${idPrefix}-panel-categories`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-categories`}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-surface border border-border text-xs">
            <p className="text-muted">
              {isBn
                ? 'স্টোরফ্রন্ট নেভিগেশন ও হোমপেজের ফিল্টার সেকশনের জন্য ক্যাটাগরি তৈরি ও সাজানো।'
                : 'Create and organize categories for storefront navigation and catalog filters.'}
            </p>
            {isSuperAdmin && (
              <button
                type="button"
                onClick={() => openCategoryModal()}
                className="flex min-h-11 shrink-0 items-center gap-1.5 px-3 py-2 bg-ink text-bg font-semibold text-xs border border-ink"
              >
                <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                {isBn ? 'নতুন ক্যাটাগরি' : 'New Category'}
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {categories.map((cat) => {
              const productCount = products.filter((p) => p.categoryId === cat.id).length;
              const catTitle = isBn ? cat.nameBn : cat.nameEn || cat.nameBn;
              return (
                <div
                  key={cat.id}
                  className="p-4 bg-surface border border-border flex flex-col justify-between"
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[10px] text-muted">
                        {isBn ? 'অর্ডার:' : 'Order:'} #{formatLocaleNumber(cat.sortOrder, locale)}
                      </span>
                      <span
                        className={`px-1.5 py-0.5 text-[10px] font-bold uppercase border ${
                          cat.isActive
                            ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
                            : 'bg-bg text-muted border-border'
                        }`}
                      >
                        {cat.isActive
                          ? isBn
                            ? 'সক্রিয়'
                            : 'Active'
                          : isBn
                          ? 'নিষ্ক্রিয়'
                          : 'Inactive'}
                      </span>
                    </div>
                    <h2 className="font-bold text-ink text-sm">{catTitle}</h2>
                    <p className="text-xs font-mono text-muted">
                      {isBn ? cat.nameEn : cat.nameBn} ({cat.slug})
                    </p>
                    <p className="text-xs text-muted leading-relaxed line-clamp-2">
                      {isBn ? cat.descriptionBn : cat.descriptionEn || cat.descriptionBn}
                    </p>
                  </div>

                  <div className="pt-4 mt-4 border-t border-border flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-ink">
                      {formatLocaleNumber(productCount, locale)}{' '}
                      {isBn
                        ? 'টি পণ্য সংযুক্ত'
                        : productCount === 1
                        ? 'product linked'
                        : 'products linked'}
                    </span>
                    {isSuperAdmin && (
                      <button
                        type="button"
                        onClick={() => openCategoryModal(cat)}
                        aria-label={isBn ? `${catTitle} এডিট করুন` : `Edit ${catTitle}`}
                        className="min-h-11 px-3 py-1.5 text-xs border border-border hover:border-ink transition-colors text-ink font-medium"
                      >
                        {isBn ? 'এডিট করুন' : 'Edit'}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 3: PRODUCT REVIEW MODERATION */}
      {activeTab === 'reviews' && (
        <section
          id={`${idPrefix}-panel-reviews`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-reviews`}
          className="space-y-4"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h2 className="font-bold text-ink text-sm">
                {isBn ? 'ভেরিফায়েড পারচেজ রিভিউ মডারেশন' : 'Verified-Purchase Review Moderation'}
              </h2>
              <p className="text-xs text-muted">
                {isBn
                  ? 'স্টোরফ্রন্টে প্রকাশের আগে গ্রাহকের রিভিউ অনুমোদন বা প্রত্যাখ্যান করুন।'
                  : 'Approve or reject customer reviews before they appear publicly on product pages.'}
              </p>
            </div>
            <div className="flex flex-wrap gap-1.5 text-xs">
              {(
                [
                  ['all', isBn ? 'সব' : 'All'],
                  ['pending', isBn ? 'অপেক্ষমাণ' : 'Pending'],
                  ['approved', isBn ? 'অনুমোদিত' : 'Approved'],
                  ['rejected', isBn ? 'প্রত্যাখ্যাত' : 'Rejected'],
                ] as const
              ).map(([statusKey, labelText]) => (
                <button
                  key={statusKey}
                  type="button"
                  aria-pressed={reviewFilter === statusKey}
                  onClick={() => setReviewFilter(statusKey)}
                  className={`min-h-11 px-3 border transition-colors ${
                    reviewFilter === statusKey
                      ? 'border-ink bg-ink text-bg font-semibold'
                      : 'border-border bg-surface text-muted hover:text-ink'
                  }`}
                >
                  {labelText}
                </button>
              ))}
            </div>
          </div>

          {filteredReviews.length === 0 ? (
            <div className="p-6 border border-border bg-surface text-xs text-muted">
              {isBn ? 'এই ফিল্টারে কোনো রিভিউ নেই।' : 'No reviews match this filter.'}
            </div>
          ) : (
            <div className="divide-y divide-border border border-border bg-surface">
              {filteredReviews.map((rev) => (
                <div
                  key={rev.reviewId}
                  className="p-4 flex flex-col sm:flex-row sm:items-start justify-between gap-3 text-xs"
                >
                  <div className="space-y-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-ink">{rev.productNameBn}</span>
                      <span className="font-mono text-muted">{rev.publicSku}</span>
                      <span className="font-semibold text-ink tabular-nums">
                        {formatLocaleNumber(rev.rating, locale)}/5
                      </span>
                      <span className="text-muted">
                        · {rev.moderationStatus}
                        {rev.isVerifiedPurchase
                          ? isBn
                            ? ' · ভেরিফায়েড'
                            : ' · Verified'
                          : ''}
                      </span>
                    </div>
                    <p className="text-ink text-sm break-words">{rev.comment}</p>
                    <p className="text-muted tabular-nums">
                      {rev.customerName} · {formatLocaleDateTime(rev.createdAt, locale)}
                    </p>
                  </div>
                  {canModerateReviews && (
                    <div className="flex flex-wrap gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={
                          moderatingReviewId === rev.reviewId ||
                          rev.moderationStatus === 'approved'
                        }
                        onClick={() => void handleModerateReview(rev.reviewId, 'approved')}
                        className="min-h-11 px-3 border border-border bg-bg text-ink font-medium hover:border-ink disabled:opacity-40"
                      >
                        {isBn ? 'অনুমোদন' : 'Approve'}
                      </button>
                      <button
                        type="button"
                        disabled={
                          moderatingReviewId === rev.reviewId ||
                          rev.moderationStatus === 'rejected'
                        }
                        onClick={() => void handleModerateReview(rev.reviewId, 'rejected')}
                        className="min-h-11 px-3 border border-danger/40 text-danger font-medium hover:bg-danger/10 disabled:opacity-40"
                      >
                        {isBn ? 'প্রত্যাখ্যান' : 'Reject'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* TAB 4: PRODUCT LINKAGE REVIEW */}
      {activeTab === 'connectivity' && (
        <section
          id={`${idPrefix}-panel-connectivity`}
          role="tabpanel"
          aria-labelledby={`${idPrefix}-tab-connectivity`}
          className="space-y-4"
        >
          <h2 className="font-bold text-ink text-sm">
            {isBn ? 'পণ্য সংযোগ পর্যালোচনা' : 'Product Linkage Review'}
          </h2>
          <p className="text-xs text-muted">
            {isBn
              ? 'বর্তমান তালিকায় ভেন্ডর, ক্যাটাগরি ও ভ্যারিয়েন্টের তথ্য দেখানো হচ্ছে। এটি অর্ডার, স্টক, পেমেন্ট বা কুরিয়ার সংযোগের পূর্ণাঙ্গ পরীক্ষা নয়।'
              : 'Vendor, category and variant information is checked against the current workspace data. This is not an end-to-end test of orders, stock, payments or couriers.'}
          </p>
          {products.length === 0 ? (
            <p className="text-sm text-muted">
              {isBn ? 'কোনো পণ্য নেই।' : 'No products available.'}
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {products.map((product) => {
                const vendor = vendors.find((v) => v.vendorId === product.vendorId);
                const category = categories.find((c) => c.id === product.categoryId);
                return (
                  <div
                    key={product.productId}
                    className="p-4 border border-border bg-surface space-y-1 text-xs"
                  >
                    <p className="font-bold text-ink">
                      {isBn ? product.nameBn : product.nameEn || product.nameBn}
                    </p>
                    <p className="text-muted">
                      <span className="font-semibold text-ink">{isBn ? 'ভেন্ডর:' : 'Vendor:'}</span>{' '}
                      {vendor
                        ? `${isBn ? vendor.businessNameBn : vendor.businessNameEn || vendor.businessNameBn} (${vendor.vendorCode})`
                        : isBn
                        ? 'বর্তমান তালিকায় পাওয়া যায়নি'
                        : 'Not available in this view'}
                    </p>
                    <p className="text-muted">
                      <span className="font-semibold text-ink">{isBn ? 'ক্যাটাগরি:' : 'Category:'}</span>{' '}
                      {category
                        ? isBn
                          ? category.nameBn
                          : category.nameEn
                        : isBn
                        ? 'বর্তমান তালিকায় পাওয়া যায়নি'
                        : 'Not available in this view'}
                    </p>
                    <p className="text-muted">
                      <span className="font-semibold text-ink">{isBn ? 'ভ্যারিয়েন্ট:' : 'Variants:'}</span>{' '}
                      {formatLocaleNumber(product.variants?.length ?? 0, locale)}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      )}

      {/* MODAL 1: PRODUCT ADD / EDIT DRAWER */}
      {isEditorOpen && editingProduct && (
        <div
          style={{ top: bannerOffsetPx }}
          className="fixed inset-x-0 bottom-0 z-50 bg-black/60 flex items-stretch justify-end"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-editor-title`}
            style={{ height: `calc(100dvh - ${bannerOffsetPx}px)` }}
            className="w-full max-w-4xl bg-surface border-l border-border p-4 sm:p-6 pb-[max(1rem,env(safe-area-inset-bottom))] overflow-y-auto space-y-6"
          >
            <div className="flex items-center justify-between gap-3 border-b border-border pb-4">
              <div>
                <h2 id={`${idPrefix}-editor-title`} className="text-base font-bold text-ink">
                  {editingProduct.productId
                    ? isBn
                      ? 'পণ্য তথ্য এডিট করুন'
                      : 'Edit Product'
                    : isBn
                    ? 'নতুন পণ্য যুক্ত করুন'
                    : 'Add New Product'}
                </h2>
                <p className="text-xs text-muted">
                  {isBn
                    ? '৩-স্তরীয় পয়সা প্রাইসিং ক্যালকুলেটর, মাল্টি-ভ্যারিয়েন্ট SKU এবং ওয়্যারহাউস স্টক'
                    : '3-tier Poisha pricing calculator, multi-variant SKU and warehouse inventory'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditorOpen(false)}
                aria-label={isBn ? 'পণ্য সম্পাদক বন্ধ করুন' : 'Close product editor'}
                className="min-h-11 min-w-11 flex items-center justify-center text-muted hover:text-ink transition-colors"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            {editorError && (
              <div
                role="alert"
                className="p-3 text-xs font-medium border bg-danger/10 border-danger/30 text-danger"
              >
                {editorError}
              </div>
            )}

            <form onSubmit={handleSaveProduct} className="space-y-6 text-xs">
              {/* Section 1: Basic Details */}
              <div className="space-y-4">
                <h3 className="font-bold uppercase text-[11px] tracking-wider text-muted">
                  {isBn ? '১. সাধারণ তথ্য ও আইডেন্টিফিকেশন' : '1. General Information & Identification'}
                </h3>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-name-bn`} className="block font-semibold text-ink">
                      {isBn ? 'পণ্যের নাম (বাংলা) *' : 'Product Name (Bangla) *'}
                    </label>
                    <input
                      id={`${idPrefix}-prod-name-bn`}
                      type="text"
                      required
                      maxLength={160}
                      placeholder="যেমন: প্রিমিয়াম জামদানি শাড়ি"
                      value={editingProduct.nameBn}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, nameBn: e.target.value })
                      }
                      className={INPUT_CLASS}
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-name-en`} className="block font-semibold text-ink">
                      {isBn ? 'পণ্যের নাম (ইংরেজি) *' : 'Product Name (English) *'}
                    </label>
                    <input
                      id={`${idPrefix}-prod-name-en`}
                      type="text"
                      required
                      maxLength={160}
                      placeholder="e.g. Premium Handloom Jamdani Saree"
                      value={editingProduct.nameEn}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, nameEn: e.target.value })
                      }
                      className={`${INPUT_CLASS} font-mono`}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-category`} className="block font-semibold text-ink">
                      {isBn ? 'ক্যাটাগরি নির্বাচন করুন *' : 'Select Category *'}
                    </label>
                    <select
                      id={`${idPrefix}-prod-category`}
                      required
                      value={editingProduct.categoryId}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, categoryId: e.target.value })
                      }
                      className={INPUT_CLASS}
                    >
                      {categories.map((c) => (
                        <option key={c.id} value={c.id}>
                          {isBn ? c.nameBn : c.nameEn} ({isBn ? c.nameEn : c.nameBn})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-vendor`} className="block font-semibold text-ink">
                      {isBn ? 'ভেন্ডর / প্রস্তুতকারক *' : 'Vendor / Manufacturer *'}
                    </label>
                    <select
                      id={`${idPrefix}-prod-vendor`}
                      required
                      value={editingProduct.vendorId}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, vendorId: e.target.value })
                      }
                      className={INPUT_CLASS}
                    >
                      {vendors.map((v) => (
                        <option key={v.vendorId} value={v.vendorId}>
                          {isBn ? v.businessNameBn : v.businessNameEn} ({v.vendorCode})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-status`} className="block font-semibold text-ink">
                      {isBn ? 'ক্যাটালগ স্ট্যাটাস *' : 'Catalog Status *'}
                    </label>
                    <select
                      id={`${idPrefix}-prod-status`}
                      value={editingProduct.status}
                      onChange={(e) =>
                        setEditingProduct({
                          ...editingProduct,
                          status: e.target.value as 'active' | 'draft' | 'archived',
                        })
                      }
                      className={INPUT_CLASS}
                    >
                      <option value="active">{isBn ? 'সক্রিয় (Active)' : 'Active'}</option>
                      <option value="draft">{isBn ? 'ড্রাফট (Draft)' : 'Draft'}</option>
                      <option value="archived">{isBn ? 'আর্কাইভড (Archived)' : 'Archived'}</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-desc-bn`} className="block font-semibold text-ink">
                      {isBn ? 'পণ্যের বিবরণ (বাংলা) *' : 'Product Description (Bangla) *'}
                    </label>
                    <textarea
                      id={`${idPrefix}-prod-desc-bn`}
                      rows={3}
                      required
                      maxLength={4000}
                      placeholder="পণ্যের গুণগত মান, সুতা, তৈরির বিবরণ ইত্যাদি..."
                      value={editingProduct.descriptionBn}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, descriptionBn: e.target.value })
                      }
                      className={`${INPUT_CLASS} leading-relaxed`}
                    />
                  </div>

                  <div className="space-y-1">
                    <label htmlFor={`${idPrefix}-prod-desc-en`} className="block font-semibold text-ink">
                      {isBn ? 'পণ্যের বিবরণ (ইংরেজি)' : 'Product Description (English)'}
                    </label>
                    <textarea
                      id={`${idPrefix}-prod-desc-en`}
                      rows={3}
                      maxLength={4000}
                      placeholder="Material quality, craft details, dimensions..."
                      value={editingProduct.descriptionEn}
                      onChange={(e) =>
                        setEditingProduct({ ...editingProduct, descriptionEn: e.target.value })
                      }
                      className={`${INPUT_CLASS} leading-relaxed`}
                    />
                  </div>
                </div>

                {/* Product Flags */}
                <div className="space-y-3 pt-1">
                  <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
                    <label
                      htmlFor={`${idPrefix}-prod-featured`}
                      className="flex min-h-11 items-center gap-2 cursor-pointer"
                    >
                      <input
                        id={`${idPrefix}-prod-featured`}
                        type="checkbox"
                        checked={editingProduct.isFeatured}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isFeatured: e.target.checked })
                        }
                        className="w-4 h-4 rounded-none border border-border"
                      />
                      <span className="font-semibold text-ink">
                        {isBn ? 'হোমপেজে ফিচার্ড পণ্য হিসেবে দেখান' : 'Feature on homepage'}
                      </span>
                    </label>

                    <label
                      htmlFor={`${idPrefix}-prod-free-delivery`}
                      className="flex min-h-11 items-center gap-2 cursor-pointer"
                    >
                      <input
                        id={`${idPrefix}-prod-free-delivery`}
                        type="checkbox"
                        checked={editingProduct.isFreeDelivery}
                        onChange={(e) =>
                          setEditingProduct({ ...editingProduct, isFreeDelivery: e.target.checked })
                        }
                        className="w-4 h-4 rounded-none border border-border"
                      />
                      <span className="font-semibold text-ink">
                        {isBn ? 'ফ্রি ডেলিভারি প্রযোজ্য' : 'Eligible for free delivery'}
                      </span>
                    </label>
                  </div>

                  <div className="pt-2 border-t border-border/50 space-y-2">
                    <label
                      htmlFor={`${idPrefix}-prod-advance-courier`}
                      className="flex min-h-11 items-center gap-2 cursor-pointer"
                    >
                      <input
                        id={`${idPrefix}-prod-advance-courier`}
                        type="checkbox"
                        checked={Boolean(editingProduct.requiresAdvanceCourierCharge)}
                        onChange={(e) =>
                          setEditingProduct({
                            ...editingProduct,
                            requiresAdvanceCourierCharge: e.target.checked,
                          })
                        }
                        className="w-4 h-4 rounded-none border border-border"
                      />
                      <span className="font-semibold text-amber-900">
                        {isBn
                          ? 'অগ্রিম কুরিয়ার চার্জ বাধ্যতামূলক'
                          : 'Require advance courier charge'}
                      </span>
                    </label>
                    <p className="text-[11px] text-muted">
                      {isBn
                        ? 'এই পণ্যটি কার্টে থাকলে গ্রাহককে ডেলিভারি চার্জ ও নির্ধারিত ডিপোজিট অগ্রিম প্রদান করতে হবে।'
                        : 'When this product is in the cart, customers pay the delivery fee and optional deposit in advance.'}
                    </p>

                    {editingProduct.requiresAdvanceCourierCharge && (
                      <div className="p-3 border border-amber-300 bg-amber-50 space-y-1.5">
                        <label
                          htmlFor={`${idPrefix}-prod-advance-deposit`}
                          className="block text-[11px] font-bold text-amber-900"
                        >
                          {isBn
                            ? 'অতিরিক্ত অগ্রিম ডিপোজিট (ঐচ্ছিক ৳ BDT):'
                            : 'Extra Advance Deposit (optional ৳ BDT):'}
                        </label>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="text-xs font-bold text-ink" aria-hidden="true">
                            ৳
                          </span>
                          <input
                            id={`${idPrefix}-prod-advance-deposit`}
                            type="number"
                            min={0}
                            step={10}
                            value={
                              editingProduct.customAdvanceDepositPoisha
                                ? Math.round(editingProduct.customAdvanceDepositPoisha / 100)
                                : 0
                            }
                            onChange={(e) =>
                              setEditingProduct({
                                ...editingProduct,
                                customAdvanceDepositPoisha: Math.max(0, Number(e.target.value) || 0) * 100,
                              })
                            }
                            className="w-36 px-2.5 py-1.5 text-base lg:text-xs border border-amber-300 bg-white text-ink font-mono font-bold"
                            placeholder="0"
                          />
                          <span className="text-[11px] text-amber-900">
                            {isBn
                              ? '(ডেলিভারি চার্জের অতিরিক্ত অ্যাডভান্স হিসেবে জমা হবে)'
                              : '(Added on top of the advance delivery charge)'}
                          </span>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Section 2: Multi-Variant & 3-Tier Poisha Pricing */}
              <div className="space-y-4 pt-4 border-t border-border">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h3 className="font-bold uppercase text-[11px] tracking-wider text-muted">
                      {isBn
                        ? '২. ভ্যারিয়েন্ট, SKU ও ৩-স্তরীয় প্রাইসিং ম্যাট্রিক্স'
                        : '2. Variants, SKU & 3-Tier Pricing Matrix'}
                    </h3>
                    <p className="text-[11px] text-muted">
                      {isBn
                        ? 'মূল্য হিসাব: (সাপ্লায়ার খরচ + লাভ = প্রদেয়) + প্ল্যাটফর্ম মার্জিন = চূড়ান্ত বিক্রয় মূল্য'
                        : 'Formula: (Supplier Cost + Supplier Profit = Supplier Payable) + Platform Margin = Final Sale Price'}
                    </p>
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
                            titleEn: `Variant ${editingProduct.variants.length + 1}`,
                          },
                        ],
                      });
                    }}
                    className="flex min-h-11 items-center gap-1.5 px-3 py-1.5 bg-surface border border-border text-ink font-semibold hover:bg-bg transition-colors"
                  >
                    <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                    {isBn ? 'নতুন ভ্যারিয়েন্ট' : 'Add Variant'}
                  </button>
                </div>

                <div className="space-y-4">
                  {editingProduct.variants.map((variant, vIdx) => {
                    const isExistingVariant = Boolean(variant.variantId);
                    const payableBdt =
                      Number(variant.supplierCostBdt || 0) + Number(variant.supplierProfitBdt || 0);
                    const finalSalePriceBdt =
                      payableBdt + Number(variant.platformMarginBdt || 0);
                    const vPrefix = `${idPrefix}-v-${vIdx}`;

                    return (
                      <div
                        key={variant.variantId ?? `new-${vIdx}`}
                        className="p-4 bg-bg border border-border space-y-3"
                      >
                        <div className="flex items-center justify-between pb-2 border-b border-border">
                          <span className="font-bold text-ink text-xs">
                            {isBn ? `ভ্যারিয়েন্ট #${vIdx + 1}:` : `Variant #${vIdx + 1}:`}{' '}
                            {(isBn ? variant.titleBn : variant.titleEn || variant.titleBn) ||
                              (isBn ? 'নামহীন' : 'Untitled')}
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
                              className="min-h-11 px-2 text-danger hover:underline text-xs flex items-center gap-1"
                            >
                              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                              {isBn ? 'রিমুভ' : 'Remove'}
                            </button>
                          )}
                        </div>

                        {/* Title, SKUs & Weight */}
                        <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-title-bn`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'ভ্যারিয়েন্ট নাম (বাংলা) *' : 'Variant Name (Bangla) *'}
                            </label>
                            <input
                              id={`${vPrefix}-title-bn`}
                              type="text"
                              required
                              maxLength={120}
                              value={variant.titleBn}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx ? { ...item, titleBn: e.target.value } : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={VARIANT_INPUT_CLASS}
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-title-en`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'ভ্যারিয়েন্ট নাম (ইংরেজি)' : 'Variant Name (English)'}
                            </label>
                            <input
                              id={`${vPrefix}-title-en`}
                              type="text"
                              maxLength={120}
                              value={variant.titleEn}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx ? { ...item, titleEn: e.target.value } : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={VARIANT_INPUT_CLASS}
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-public-sku`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'পাবলিক SKU *' : 'Public SKU *'}
                            </label>
                            <input
                              id={`${vPrefix}-public-sku`}
                              type="text"
                              required
                              maxLength={64}
                              placeholder="e.g. BG-JAM-01"
                              value={variant.publicSku}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx ? { ...item, publicSku: e.target.value } : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={`${VARIANT_INPUT_CLASS} font-mono`}
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-vendor-sku`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'ইন্টারনাল ভেন্ডর SKU' : 'Private Supplier SKU'}
                            </label>
                            <input
                              id={`${vPrefix}-vendor-sku`}
                              type="text"
                              maxLength={64}
                              placeholder="e.g. VND-JAM-CRIMSON"
                              value={variant.internalVendorSku}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx
                                    ? { ...item, internalVendorSku: e.target.value }
                                    : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={`${VARIANT_INPUT_CLASS} font-mono`}
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-weight`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'ওজন (গ্রাম) *' : 'Weight (grams) *'}
                            </label>
                            <input
                              id={`${vPrefix}-weight`}
                              type="number"
                              required
                              min={10}
                              max={100000}
                              value={variant.weightGrams}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx
                                    ? { ...item, weightGrams: Number(e.target.value) }
                                    : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={`${VARIANT_INPUT_CLASS} font-mono`}
                            />
                          </div>
                        </div>

                        {/* 3-Tier Pricing Calculator Fields */}
                        <div className="grid grid-cols-2 md:grid-cols-6 gap-2.5 p-3 bg-surface border border-border text-xs">
                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-cost`} className="block text-[10px] text-muted font-semibold">
                              {isBn ? '১. সাপ্লায়ার খরচ (৳)' : '1. Supplier Cost (৳)'}
                            </label>
                            <input
                              id={`${vPrefix}-cost`}
                              type="number"
                              required
                              min={0}
                              value={variant.supplierCostBdt}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx
                                    ? { ...item, supplierCostBdt: Number(e.target.value) }
                                    : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1.5 bg-bg border border-border text-ink font-mono text-base lg:text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-profit`} className="block text-[10px] text-muted font-semibold">
                              {isBn ? '২. সাপ্লায়ার লাভ (৳)' : '2. Supplier Profit (৳)'}
                            </label>
                            <input
                              id={`${vPrefix}-profit`}
                              type="number"
                              required
                              min={0}
                              value={variant.supplierProfitBdt}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx
                                    ? { ...item, supplierProfitBdt: Number(e.target.value) }
                                    : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1.5 bg-bg border border-border text-ink font-mono text-base lg:text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="block text-[10px] text-ink font-bold">
                              {isBn ? 'সাপ্লায়ার প্রদেয় (স্বয়ংক্রিয়)' : 'Supplier Payable'}
                            </span>
                            <div className="px-2 py-1.5 bg-bg border border-border text-ink font-mono font-bold">
                              ৳{formatLocaleNumber(payableBdt, locale)}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-margin`} className="block text-[10px] text-emerald-800 font-semibold">
                              {isBn ? '৩. প্ল্যাটফর্ম মার্জিন (৳)' : '3. Platform Margin (৳)'}
                            </label>
                            <input
                              id={`${vPrefix}-margin`}
                              type="number"
                              required
                              min={0}
                              value={variant.platformMarginBdt}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx
                                    ? { ...item, platformMarginBdt: Number(e.target.value) }
                                    : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className="w-full px-2 py-1.5 bg-bg border border-border text-emerald-800 font-mono font-bold text-base lg:text-xs"
                            />
                          </div>

                          <div className="space-y-1">
                            <span className="block text-[10px] text-ink font-bold">
                              {isBn ? 'চূড়ান্ত বিক্রয় মূল্য' : 'Final Sale Price'}
                            </span>
                            <div className="px-2 py-1.5 bg-bg border border-ink text-ink font-mono font-bold">
                              ৳{formatLocaleNumber(finalSalePriceBdt, locale)}
                            </div>
                          </div>

                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-stock`} className="block text-[10px] text-muted font-semibold">
                              {isBn ? 'অন-হ্যান্ড স্টক (পিস)' : 'Stock on Hand (units)'}
                            </label>
                            <input
                              id={`${vPrefix}-stock`}
                              type="number"
                              required
                              min={0}
                              readOnly={isExistingVariant}
                              aria-readonly={isExistingVariant ? 'true' : undefined}
                              aria-describedby={isExistingVariant ? `${vPrefix}-stock-hint` : undefined}
                              value={variant.stockOnHand}
                              onChange={(e) => {
                                if (isExistingVariant) return;
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx
                                    ? { ...item, stockOnHand: Number(e.target.value) }
                                    : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={`w-full px-2 py-1.5 border border-border font-mono font-bold text-base lg:text-xs ${
                                isExistingVariant
                                  ? 'bg-surface text-muted cursor-not-allowed'
                                  : 'bg-bg text-ink'
                              }`}
                            />
                          </div>
                        </div>

                        {isExistingVariant && (
                          <p id={`${vPrefix}-stock-hint`} className="text-[11px] text-muted">
                            {isBn
                              ? 'সংরক্ষিত ভ্যারিয়েন্টের স্টক এখান থেকে পরিবর্তন করা যাবে না — অডিট কারণসহ ইনভেন্টরি সমন্বয় প্যানেল ব্যবহার করুন।'
                              : 'Stock on saved variants is read-only here — use reason-logged Inventory Adjustment to change stock.'}
                          </p>
                        )}

                        {/* Image URL & Attributes */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-image-url`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'ভ্যারিয়েন্ট ছবি URL' : 'Variant Image URL'}
                            </label>
                            <input
                              id={`${vPrefix}-image-url`}
                              type="url"
                              placeholder="https://..."
                              value={variant.imageUrl}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx ? { ...item, imageUrl: e.target.value } : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={`${VARIANT_INPUT_CLASS} font-mono`}
                            />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-size`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'সাইজ / পরিমাপ' : 'Size / Measurements'}
                            </label>
                            <input
                              id={`${vPrefix}-size`}
                              type="text"
                              value={variant.size}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx ? { ...item, size: e.target.value } : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={VARIANT_INPUT_CLASS}
                            />
                          </div>
                          <div className="space-y-1">
                            <label htmlFor={`${vPrefix}-color`} className="block text-[11px] font-semibold text-ink">
                              {isBn ? 'রং / শেড' : 'Colour / Shade'}
                            </label>
                            <input
                              id={`${vPrefix}-color`}
                              type="text"
                              value={variant.color}
                              onChange={(e) => {
                                const copy = editingProduct.variants.map((item, idx) =>
                                  idx === vIdx ? { ...item, color: e.target.value } : item
                                );
                                setEditingProduct({ ...editingProduct, variants: copy });
                              }}
                              className={VARIANT_INPUT_CLASS}
                            />
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Section 3: Product Specs & Gallery */}
              <div className="space-y-4 pt-4 border-t border-border">
                <h3 className="font-bold uppercase text-[11px] tracking-wider text-muted">
                  {isBn ? '৩. ইমেজ গ্যালারি ও স্পেসিফিকেশন টেবিল' : '3. Image Gallery & Specifications'}
                </h3>

                <div className="space-y-2">
                  <label htmlFor={`${idPrefix}-upload-file`} className="block font-semibold text-ink">
                    {isBn
                      ? 'মোবাইল বা কম্পিউটার থেকে ছবি যোগ করুন'
                      : 'Upload from your phone or computer'}
                  </label>
                  <input
                    id={`${idPrefix}-upload-file`}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    disabled={isUploading || !editingProduct.productId}
                    className="block w-full text-xs"
                    onChange={(event) => {
                      const file = event.currentTarget.files?.[0];
                      if (file) void uploadImage(file);
                      event.currentTarget.value = '';
                    }}
                  />
                  <p className="text-xs text-muted">
                    {!editingProduct.productId
                      ? isBn
                        ? 'ছবি আপলোডের আগে পণ্যটি ড্রাফট হিসেবে সংরক্ষণ করুন।'
                        : 'Save the product as a draft before uploading images.'
                      : isBn
                      ? 'JPEG, PNG বা WebP; সর্বোচ্চ ৫ MB। আপলোডের পরে আলাদা অনুমোদন প্রয়োজন।'
                      : 'JPEG, PNG or WebP; maximum 5 MB. Uploaded images require approval.'}
                  </p>
                  {isUploading && (
                    <button
                      type="button"
                      onClick={() => uploadController.current?.abort()}
                      className="min-h-11 px-2 text-xs underline"
                    >
                      {isBn ? 'আপলোড হচ্ছে… বাতিল করুন' : 'Uploading… Cancel'}
                    </button>
                  )}
                  <div className="flex flex-wrap gap-3">
                    {stagedImages
                      .filter((image) => image.productId === editingProduct.productId)
                      .map((image) => (
                        <div
                          key={image.assetId}
                          className="space-y-1 border border-border p-2 bg-bg"
                        >
                          <img
                            src={image.previewUrl}
                            alt={isBn ? 'অনুমোদনের অপেক্ষায় ছবি' : 'Image awaiting approval'}
                            className="h-24 w-24 object-contain"
                          />
                          {isSuperAdmin && (
                            <button
                              type="button"
                              disabled={isUploading}
                              onClick={() => void approveImage(image.assetId)}
                              className="min-h-11 px-2 text-xs underline text-ink"
                            >
                              {isBn ? 'পর্যালোচনা শেষে অনুমোদন করুন' : 'Review and approve'}
                            </button>
                          )}
                        </div>
                      ))}
                  </div>

                  <label htmlFor={`${idPrefix}-gallery-urls`} className="block font-semibold text-ink pt-1">
                    {isBn
                      ? 'ইমেজ গ্যালারি URL (প্রতি লাইনে একটি বা কমা দিয়ে আলাদা করুন)'
                      : 'Image Gallery URLs (one per line or comma-separated)'}
                  </label>
                  <textarea
                    id={`${idPrefix}-gallery-urls`}
                    rows={2}
                    value={imageUrlsDraft}
                    placeholder={
                      isBn ? 'প্রতি লাইনে একটি HTTPS ছবির লিংক' : 'One HTTPS image URL per line'
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setImageUrlsDraft(value);
                      setEditingProduct({
                        ...editingProduct,
                        images: value
                          .split(/[,\n]/)
                          .map((s) => s.trim())
                          .filter(Boolean),
                      });
                    }}
                    className={`${INPUT_CLASS} font-mono`}
                  />
                  {editingProduct.images.length > 0 && (
                    <div className="flex gap-2 overflow-x-auto py-1">
                      {editingProduct.images.map((img, i) => (
                        <img
                          key={`${img}-${i}`}
                          src={productImageUrl(img)}
                          onError={productImageFallback}
                          alt={isBn ? `গ্যালারি ছবি ${i + 1}` : `Gallery image ${i + 1}`}
                          className="w-14 h-14 object-cover border border-border shrink-0"
                        />
                      ))}
                    </div>
                  )}
                </div>

                {/* Specifications */}
                <div className="space-y-2 pt-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-ink">
                      {isBn ? 'পণ্যের স্পেসিফিকেশন' : 'Product Specifications'}
                    </span>
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
                      className="min-h-11 px-2 text-xs font-semibold text-ink underline"
                    >
                      {isBn ? '+ নতুন স্পেসিফিকেশন' : '+ Add Specification'}
                    </button>
                  </div>

                  {editingProduct.specs.length === 0 ? (
                    <p className="text-xs text-muted">
                      {isBn
                        ? 'কোনো স্পেসিফিকেশন যোগ করা হয়নি।'
                        : 'No specifications added yet.'}
                    </p>
                  ) : (
                    editingProduct.specs.map((spec, sIdx) => (
                      <div key={sIdx} className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_1fr_1fr_auto] gap-2 items-center">
                        <input
                          type="text"
                          aria-label={isBn ? `স্পেসিফিকেশন লেবেল বাংলা ${sIdx + 1}` : `Specification label Bangla ${sIdx + 1}`}
                          placeholder="লেবেল (যেমন: ফেব্রিক)"
                          value={spec.labelBn}
                          onChange={(e) => {
                            const copy = editingProduct.specs.map((item, idx) =>
                              idx === sIdx ? { ...item, labelBn: e.target.value } : item
                            );
                            setEditingProduct({ ...editingProduct, specs: copy });
                          }}
                          className={INPUT_CLASS}
                        />
                        <input
                          type="text"
                          aria-label={isBn ? `স্পেসিফিকেশন মান বাংলা ${sIdx + 1}` : `Specification value Bangla ${sIdx + 1}`}
                          placeholder="মান (যেমন: হ্যান্ডলুম)"
                          value={spec.valueBn}
                          onChange={(e) => {
                            const copy = editingProduct.specs.map((item, idx) =>
                              idx === sIdx ? { ...item, valueBn: e.target.value } : item
                            );
                            setEditingProduct({ ...editingProduct, specs: copy });
                          }}
                          className={INPUT_CLASS}
                        />
                        <input
                          type="text"
                          aria-label={isBn ? `স্পেসিফিকেশন লেবেল ইংরেজি ${sIdx + 1}` : `Specification label English ${sIdx + 1}`}
                          placeholder="Label (English)"
                          value={spec.labelEn}
                          onChange={(e) => {
                            const copy = editingProduct.specs.map((item, idx) =>
                              idx === sIdx ? { ...item, labelEn: e.target.value } : item
                            );
                            setEditingProduct({ ...editingProduct, specs: copy });
                          }}
                          className={`${INPUT_CLASS} font-mono`}
                        />
                        <input
                          type="text"
                          aria-label={isBn ? `স্পেসিফিকেশন মান ইংরেজি ${sIdx + 1}` : `Specification value English ${sIdx + 1}`}
                          placeholder="Value (English)"
                          value={spec.valueEn}
                          onChange={(e) => {
                            const copy = editingProduct.specs.map((item, idx) =>
                              idx === sIdx ? { ...item, valueEn: e.target.value } : item
                            );
                            setEditingProduct({ ...editingProduct, specs: copy });
                          }}
                          className={`${INPUT_CLASS} font-mono`}
                        />
                        <button
                          type="button"
                          onClick={() => {
                            setEditingProduct({
                              ...editingProduct,
                              specs: editingProduct.specs.filter((_, idx) => idx !== sIdx),
                            });
                          }}
                          aria-label={isBn ? `স্পেসিফিকেশন ${sIdx + 1} সরান` : `Remove specification ${sIdx + 1}`}
                          className="min-h-11 min-w-11 inline-flex items-center justify-center border border-border bg-bg text-danger hover:border-danger"
                        >
                          <Trash2 className="w-4 h-4" aria-hidden="true" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Submit Buttons */}
              <div className="pt-6 border-t border-border flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsEditorOpen(false)}
                  className="min-h-11 px-4 py-2 bg-surface text-ink border border-border hover:bg-bg transition-colors"
                >
                  {isBn ? 'বাতিল করুন' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="min-h-11 px-6 py-2 bg-ink text-bg font-bold border border-ink hover:opacity-90 disabled:opacity-50 transition-opacity"
                >
                  {isSaving
                    ? isBn
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : isBn
                    ? 'পণ্য ও ভ্যারিয়েন্ট সংরক্ষণ করুন'
                    : 'Save Product & Variants'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: PRODUCT LINKAGE SNAPSHOT */}
      {inspectProduct && (
        <div
          style={{ top: bannerOffsetPx }}
          className="fixed inset-x-0 bottom-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-inspect-title`}
            style={{ maxHeight: `calc(100dvh - ${bannerOffsetPx}px - 2rem)` }}
            className="w-full max-w-3xl bg-surface border border-border p-4 sm:p-6 space-y-4 overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <div>
                <h2 id={`${idPrefix}-inspect-title`} className="font-bold text-ink text-base">
                  {isBn ? inspectProduct.nameBn : inspectProduct.nameEn || inspectProduct.nameBn}
                </h2>
                <p className="text-xs text-muted mt-0.5">
                  {isBn
                    ? 'এগুলো বর্তমান পণ্যের সংরক্ষিত তথ্য; অন্যান্য সেবার কার্যকারিতা নিশ্চিত করে না।'
                    : 'These are fields from the current product snapshot; they do not verify downstream services.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectProduct(null)}
                aria-label={isBn ? 'সংযোগ তথ্য বন্ধ করুন' : 'Close product linkage details'}
                className="min-h-11 min-w-11 flex items-center justify-center text-muted hover:text-ink shrink-0"
              >
                <X className="w-5 h-5" aria-hidden="true" />
              </button>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs bg-bg border border-border p-3">
              <div>
                <p className="text-muted">{isBn ? 'ভেন্ডর' : 'Vendor'}</p>
                <p className="font-semibold text-ink">
                  {inspectVendor
                    ? `${isBn ? inspectVendor.businessNameBn : inspectVendor.businessNameEn} (${inspectVendor.vendorCode})`
                    : inspectProduct.vendorBusinessName}
                </p>
                <p className="font-mono text-[11px] text-muted break-all">
                  {isBn ? 'ভেন্ডর আইডি:' : 'Vendor ID:'} {inspectProduct.vendorId}
                </p>
              </div>
              <div>
                <p className="text-muted">{isBn ? 'ক্যাটাগরি' : 'Category'}</p>
                <p className="font-semibold text-ink">
                  {inspectCategory
                    ? isBn
                      ? inspectCategory.nameBn
                      : inspectCategory.nameEn
                    : inspectProduct.categoryId}
                </p>
                <p className="font-mono text-[11px] text-muted break-all">
                  {isBn ? 'ক্যাটাগরি আইডি:' : 'Category ID:'} {inspectProduct.categoryId}
                </p>
              </div>
            </div>

            <div className="space-y-2">
              {inspectProduct.variants.map((variant) => (
                <div key={variant.variantId} className="border border-border p-3 text-xs space-y-1">
                  <p className="font-bold text-ink">
                    {isBn ? variant.titleBn : variant.titleEn || variant.titleBn}
                  </p>
                  <p className="font-mono">
                    {isBn ? 'পাবলিক SKU:' : 'Public SKU:'} {variant.publicSku}
                  </p>
                  <p>
                    {isBn ? 'অন-হ্যান্ড স্টক:' : 'Stock on hand:'}{' '}
                    {formatLocaleNumber(variant.stockOnHand, locale)}
                  </p>
                  <p>
                    {isBn ? 'রিজার্ভড স্টক:' : 'Reserved stock:'}{' '}
                    {formatLocaleNumber(variant.stockReserved, locale)}
                  </p>
                  <p>
                    {isBn ? 'ওজন (গ্রাম):' : 'Weight (grams):'}{' '}
                    {formatLocaleNumber(variant.weightGrams, locale)}
                  </p>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-border">
              <button
                type="button"
                onClick={() => setInspectProduct(null)}
                className="min-h-11 px-4 py-2 bg-ink text-bg font-bold text-xs"
              >
                {isBn ? 'বন্ধ করুন' : 'Close'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 3: ARCHIVE PRODUCT CONFIRMATION DIALOG */}
      {archiveTarget && (
        <div
          style={{ top: bannerOffsetPx }}
          className="fixed inset-x-0 bottom-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-archive-title`}
            style={{ maxHeight: `calc(100dvh - ${bannerOffsetPx}px - 2rem)` }}
            className="w-full max-w-md bg-surface border border-border p-4 sm:p-6 space-y-4 overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
              <h2 id={`${idPrefix}-archive-title`} className="font-bold text-ink text-sm">
                {isBn ? 'পণ্য আর্কাইভ নিশ্চিত করুন' : 'Confirm Product Archive'}
              </h2>
              <button
                type="button"
                disabled={isArchiving}
                onClick={() => setArchiveTarget(null)}
                aria-label={isBn ? 'ডায়ালগ বন্ধ করুন' : 'Close archive confirmation'}
                className="min-h-11 min-w-11 flex items-center justify-center text-muted hover:text-ink shrink-0"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>
            <p className="text-xs text-ink leading-relaxed">
              {isBn
                ? `আপনি কি নিশ্চিত যে "${archiveTarget.nameBn}" আর্কাইভ করতে চান? এটি স্টোরফ্রন্ট থেকে লুকানো হবে, তবে পূর্বের অর্ডার, SKU ও স্টক ইতিহাস অক্ষুণ্ণ থাকবে।`
                : `Archive "${archiveTarget.nameEn || archiveTarget.nameBn}"? It will be hidden from the active storefront while preserving past orders, SKUs, and stock audit history.`}
            </p>
            <div className="pt-3 border-t border-border flex justify-end gap-2">
              <button
                type="button"
                disabled={isArchiving}
                onClick={() => setArchiveTarget(null)}
                className="min-h-11 px-4 py-2 bg-surface text-ink border border-border text-xs font-medium"
              >
                {isBn ? 'বাতিল' : 'Cancel'}
              </button>
              <button
                type="button"
                disabled={isArchiving}
                onClick={() => void handleConfirmArchiveProduct()}
                className="min-h-11 px-4 py-2 bg-danger text-white font-bold text-xs disabled:opacity-50"
              >
                {isArchiving
                  ? isBn
                    ? 'আর্কাইভ হচ্ছে...'
                    : 'Archiving...'
                  : isBn
                  ? 'আর্কাইভ করুন'
                  : 'Archive Product'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 4: CATEGORY ADD / EDIT MODAL */}
      {isCategoryModalOpen && (
        <div
          style={{ top: bannerOffsetPx }}
          className="fixed inset-x-0 bottom-0 z-50 bg-black/60 flex items-center justify-center p-4"
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-cat-modal-title`}
            style={{ maxHeight: `calc(100dvh - ${bannerOffsetPx}px - 2rem)` }}
            className="w-full max-w-md overflow-y-auto bg-surface border border-border p-4 sm:p-6 space-y-4"
          >
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h2 id={`${idPrefix}-cat-modal-title`} className="font-bold text-ink text-sm">
                {categoryFormData.id
                  ? isBn
                    ? 'ক্যাটাগরি এডিট করুন'
                    : 'Edit Category'
                  : isBn
                  ? 'নতুন ক্যাটাগরি তৈরি করুন'
                  : 'Create New Category'}
              </h2>
              <button
                type="button"
                disabled={isSavingCategory}
                onClick={() => setIsCategoryModalOpen(false)}
                aria-label={isBn ? 'ক্যাটাগরি মডাল বন্ধ করুন' : 'Close category modal'}
                className="min-h-11 min-w-11 flex items-center justify-center text-muted hover:text-ink"
              >
                <X className="w-4 h-4" aria-hidden="true" />
              </button>
            </div>

            {categoryError && (
              <div
                role="alert"
                className="p-3 text-xs font-medium border bg-danger/10 border-danger/30 text-danger"
              >
                {categoryError}
              </div>
            )}

            <form onSubmit={handleSaveCategory} className="space-y-4 text-xs">
              <div className="space-y-1">
                <label htmlFor={`${idPrefix}-cat-name-bn`} className="block font-semibold text-ink">
                  {isBn ? 'ক্যাটাগরি নাম (বাংলা) *' : 'Category Name (Bangla) *'}
                </label>
                <input
                  id={`${idPrefix}-cat-name-bn`}
                  type="text"
                  required
                  maxLength={120}
                  placeholder="যেমন: ঐতিহ্যবাহী পোশাক"
                  value={categoryFormData.nameBn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, nameBn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={`${idPrefix}-cat-name-en`} className="block font-semibold text-ink">
                  {isBn ? 'ক্যাটাগরি নাম (ইংরেজি) *' : 'Category Name (English) *'}
                </label>
                <input
                  id={`${idPrefix}-cat-name-en`}
                  type="text"
                  required
                  maxLength={120}
                  placeholder="e.g. Traditional Clothing"
                  value={categoryFormData.nameEn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, nameEn: e.target.value })
                  }
                  className={`${INPUT_CLASS} font-mono`}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={`${idPrefix}-cat-desc-bn`} className="block font-semibold text-ink">
                  {isBn ? 'বিবরণ (বাংলা) *' : 'Description (Bangla) *'}
                </label>
                <textarea
                  id={`${idPrefix}-cat-desc-bn`}
                  rows={2}
                  required
                  maxLength={1000}
                  value={categoryFormData.descriptionBn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, descriptionBn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              </div>

              <div className="space-y-1">
                <label htmlFor={`${idPrefix}-cat-desc-en`} className="block font-semibold text-ink">
                  {isBn ? 'বিবরণ (ইংরেজি)' : 'Description (English)'}
                </label>
                <textarea
                  id={`${idPrefix}-cat-desc-en`}
                  rows={2}
                  maxLength={1000}
                  placeholder="Optional English storefront description"
                  value={categoryFormData.descriptionEn}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, descriptionEn: e.target.value })
                  }
                  className={INPUT_CLASS}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor={`${idPrefix}-cat-sort`} className="block font-semibold text-ink">
                    {isBn ? 'ক্রমবিন্যাস (Sort Order)' : 'Sort Order'}
                  </label>
                  <input
                    id={`${idPrefix}-cat-sort`}
                    type="number"
                    min={0}
                    max={9999}
                    value={categoryFormData.sortOrder}
                    onChange={(e) =>
                      setCategoryFormData({
                        ...categoryFormData,
                        sortOrder: Number(e.target.value),
                      })
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>

                <div className="space-y-1">
                  <label htmlFor={`${idPrefix}-cat-icon`} className="block font-semibold text-ink">
                    {isBn ? 'আইকন নাম' : 'Icon Name'}
                  </label>
                  <input
                    id={`${idPrefix}-cat-icon`}
                    type="text"
                    maxLength={40}
                    value={categoryFormData.iconName}
                    onChange={(e) =>
                      setCategoryFormData({ ...categoryFormData, iconName: e.target.value })
                    }
                    className={`${INPUT_CLASS} font-mono`}
                  />
                </div>
              </div>

              <label
                htmlFor={`${idPrefix}-cat-active`}
                className="flex min-h-11 items-center gap-2 cursor-pointer pt-1"
              >
                <input
                  id={`${idPrefix}-cat-active`}
                  type="checkbox"
                  checked={categoryFormData.isActive}
                  onChange={(e) =>
                    setCategoryFormData({ ...categoryFormData, isActive: e.target.checked })
                  }
                  className="w-4 h-4 rounded-none border border-border"
                />
                <span className="font-semibold text-ink">
                  {isBn
                    ? 'স্টোরফ্রন্টে এই ক্যাটাগরি দৃশ্যমান রাখুন'
                    : 'Show this category on the storefront'}
                </span>
              </label>

              <div className="pt-4 border-t border-border flex justify-end gap-2">
                <button
                  type="button"
                  disabled={isSavingCategory}
                  onClick={() => setIsCategoryModalOpen(false)}
                  className="min-h-11 px-4 py-2 bg-surface text-ink border border-border"
                >
                  {isBn ? 'বাতিল' : 'Cancel'}
                </button>
                <button
                  type="submit"
                  disabled={isSavingCategory}
                  className="min-h-11 px-4 py-2 bg-ink text-bg font-bold border border-ink disabled:opacity-50"
                >
                  {isSavingCategory
                    ? isBn
                      ? 'সংরক্ষণ হচ্ছে...'
                      : 'Saving...'
                    : isBn
                    ? 'সংরক্ষণ করুন'
                    : 'Save'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
