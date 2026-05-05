/**
 * Composable cho Brand & Supplier (Module Sản phẩm — Session 1).
 * Brand có FK supplierId → join Supplier.
 * Mọi thao tác create/update/delete đều admin-only ở backend.
 */
import { ref } from 'vue';
import { api } from '@/api/index';

export interface Supplier {
  id: string;
  name: string;
  country: string | null;
  contactInfo: string | null;
  active: boolean;
  createdAt?: string;
  _count?: { brands: number };
}

export interface Brand {
  id: string;
  name: string;
  supplierId: string | null;
  supplier?: { id: string; name: string; country: string | null } | null;
  description: string | null;
  logoUrl: string | null;
  active: boolean;
  createdAt?: string;
  _count?: { products: number };
}

export function useBrands() {
  const brands = ref<Brand[]>([]);
  const suppliers = ref<Supplier[]>([]);
  const loading = ref(false);
  const saving = ref(false);

  async function fetchBrands(activeOnly = false) {
    loading.value = true;
    try {
      const res = await api.get('/brands', {
        params: { activeOnly: activeOnly ? '1' : '0' },
      });
      brands.value = res.data.brands ?? [];
    } catch (err) {
      console.error('[brands] fetch error:', err);
    } finally {
      loading.value = false;
    }
  }

  async function fetchSuppliers() {
    try {
      const res = await api.get('/suppliers');
      suppliers.value = res.data.suppliers ?? [];
    } catch (err) {
      console.error('[suppliers] fetch error:', err);
    }
  }

  async function createBrand(payload: Partial<Brand>): Promise<Brand> {
    saving.value = true;
    try {
      const res = await api.post('/brands', payload);
      return res.data;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Tạo brand thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function updateBrand(id: string, payload: Partial<Brand>): Promise<Brand> {
    saving.value = true;
    try {
      const res = await api.put(`/brands/${id}`, payload);
      return res.data;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Cập nhật brand thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function deleteBrand(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.delete(`/brands/${id}`);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.error ?? 'Xoá brand thất bại' };
    }
  }

  async function createSupplier(payload: Partial<Supplier>): Promise<Supplier> {
    saving.value = true;
    try {
      const res = await api.post('/suppliers', payload);
      return res.data;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Tạo NCC thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function updateSupplier(id: string, payload: Partial<Supplier>): Promise<Supplier> {
    saving.value = true;
    try {
      const res = await api.put(`/suppliers/${id}`, payload);
      return res.data;
    } catch (err: any) {
      throw new Error(err?.response?.data?.error ?? 'Cập nhật NCC thất bại');
    } finally {
      saving.value = false;
    }
  }

  async function deleteSupplier(id: string): Promise<{ ok: boolean; error?: string }> {
    try {
      await api.delete(`/suppliers/${id}`);
      return { ok: true };
    } catch (err: any) {
      return { ok: false, error: err?.response?.data?.error ?? 'Xoá NCC thất bại' };
    }
  }

  return {
    brands,
    suppliers,
    loading,
    saving,
    fetchBrands,
    fetchSuppliers,
    createBrand,
    updateBrand,
    deleteBrand,
    createSupplier,
    updateSupplier,
    deleteSupplier,
  };
}
