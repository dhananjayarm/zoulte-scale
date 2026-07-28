// Product/category masters over the xaur-core material endpoints that our
// backend already exposes (same physical cr_material_* tables the OMS catalog
// uses). All paths live HERE so the planned move to the zoulte-catalog-engine
// (/cat/api) is a one-file change. Field set matches the catalog engine's
// stricter validation, so payloads stay valid on either surface:
//   category: categoryCode, categoryName, defaultUom, invTypeCode
//   material: materialCode, materialName, materialCategoryCode, invTypeCode
// Server stamps company/division/createdby — never sent from here.
import { Injectable, inject } from '@angular/core';
import { Observable, map } from 'rxjs';
import { HttpGetService } from '../http-get.service';
import { HttpPostService } from '../http-post.service';

export interface CategoryRow {
  categoryCode: string;
  categoryName: string | null;
  defaultUom?: string | null;
  invTypeCode?: string | null;
}

export interface ProductRow {
  materialCode: string;
  materialName: string;
  materialCategoryCode: string | null;
  defaultUom?: string | null;
}

export interface UomRow {
  uomCode: string;
  uomName: string;
}

export interface InvTypeRow {
  invTypeCode: string;
  description: string | null;
  isSaleable?: boolean;
}

export interface CategoryCreate {
  categoryCode: string;
  categoryName: string;
  defaultUom: string;
  invTypeCode: string;
}

export interface ProductCreate {
  materialCode: string;
  materialName: string;
  materialCategoryCode: string;
  invTypeCode: string;
  defaultUom?: string;
}

interface Envelope<T> {
  status: { message: string; userMessage?: string };
  response: T;
}

/** Row shape of the legacy /products list (core MaterialMasterDTO). */
interface LegacyProductRow {
  productCode: string;
  productName: string;
  productCategory: string | null;
  defaultUom?: string | null;
}

@Injectable({ providedIn: 'root' })
export class MaterialApiService {
  private readonly httpGet = inject(HttpGetService);
  private readonly httpPost = inject(HttpPostService);

  listCategories(): Observable<CategoryRow[]> {
    // /materialcategorys silently drops categories whose inventory type isn't
    // purchaseable (our FG default isn't) — /productcategorys/company is the
    // plain company-scoped list with no inv-type or division conditions.
    return this.httpGet.get<Envelope<CategoryRow[]>>('api/cr/inv/productcategorys/company').pipe(unwrap());
  }

  createCategory(category: CategoryCreate): Observable<unknown> {
    return this.httpPost.post('api/cr/inv/productcategory', { category, attributes: [] });
  }

  listProducts(): Observable<ProductRow[]> {
    // Legacy MaterialMasterDTO speaks productName/productCode/productCategory —
    // translate here so the rest of the app keeps the catalog-engine field
    // names (the planned /cat switch then deletes these mappings, not callers).
    return this.httpGet.get<Envelope<LegacyProductRow[]>>('api/cr/inv/products').pipe(
      map((env) =>
        (env.response ?? []).map((row) => ({
          materialCode: row.productCode,
          materialName: row.productName,
          materialCategoryCode: row.productCategory,
          defaultUom: row.defaultUom,
        })),
      ),
    );
  }

  createProduct(product: ProductCreate): Observable<unknown> {
    const legacy = {
      productCode: product.materialCode,
      productName: product.materialName,
      productCategory: product.materialCategoryCode,
      invTypeCode: product.invTypeCode,
      defaultUom: product.defaultUom,
    };
    return this.httpPost.post('api/cr/inv/product', { product: legacy, inventory: null, price: [] });
  }

  listUoms(): Observable<UomRow[]> {
    return this.httpGet.get<Envelope<UomRow[]>>('api/cr/uoms?isActive=false').pipe(unwrap());
  }

  listInventoryTypes(): Observable<InvTypeRow[]> {
    return this.httpGet.get<Envelope<InvTypeRow[]>>('api/cr/inv/inventorytypes').pipe(unwrap());
  }
}

function unwrap<T>(): (source: Observable<Envelope<T[]>>) => Observable<T[]> {
  return map((env) => env.response ?? []);
}

/** "Paracetamol 500mg" → "PARACETAMOL-500MG" — editable suggestion, not law. */
export function deriveCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
}
