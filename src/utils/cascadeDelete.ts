import { Company, Branch, Store, User, StockItem, PurchaseOrder, SalesOrder, Expense } from '../types';

export interface AppState {
  companies: Company[];
  branches: Branch[];
  stores: Store[];
  users: User[];
  stockItems: StockItem[];
  purchaseOrders: PurchaseOrder[];
  salesOrders: SalesOrder[];
  expenses: Expense[];
}

/**
 * Returns active (non-deleted) entity IDs based on hierarchy rules.
 * A Store is active if it is not deleted, its branch is not deleted, and its company is not deleted.
 */
export function getActiveEntities(
  companies: Company[],
  branches: Branch[],
  stores: Store[]
) {
  const activeCompanyIds = new Set(
    companies.filter(c => !c.isDeleted).map(c => c.id)
  );
  
  const activeBranchIds = new Set(
    branches
      .filter(b => !b.isDeleted && activeCompanyIds.has(b.companyId))
      .map(b => b.id)
  );
  
  const activeStoreIds = new Set(
    stores
      .filter(s => !s.isDeleted && activeBranchIds.has(s.branchId))
      .map(s => s.id)
  );

  return {
    activeCompanyIds,
    activeBranchIds,
    activeStoreIds
  };
}

/**
 * Dynamically filters out data related to deleted entities.
 */
export function filterActiveData(state: AppState): AppState {
  const { activeCompanyIds, activeBranchIds, activeStoreIds } = getActiveEntities(
    state.companies,
    state.branches,
    state.stores
  );

  // 1. Clean user assignments
  const cleanedUsers = state.users.map(u => {
    let companyId = u.companyId;
    let branchId = u.branchId;
    let storeId = u.storeId;

    if (companyId && !activeCompanyIds.has(companyId)) {
      companyId = null;
      branchId = null;
      storeId = null;
    }
    if (branchId && !activeBranchIds.has(branchId)) {
      branchId = null;
      storeId = null;
    }
    if (storeId && !activeStoreIds.has(storeId)) {
      storeId = null;
    }

    return {
      ...u,
      companyId,
      branchId,
      storeId
    };
  });

  // 2. Clean stock references (only keep stock quantities for active stores)
  const cleanedStockItems = state.stockItems.map(item => {
    const cleanedStock: { [storeId: number]: number } = {};
    if (item.stock) {
      Object.entries(item.stock).forEach(([stIdStr, qty]) => {
        const stId = parseInt(stIdStr, 10);
        if (activeStoreIds.has(stId)) {
          cleanedStock[stId] = qty;
        }
      });
    }
    return {
      ...item,
      stock: cleanedStock
    };
  });

  // 3. Filter orders and expenses belonging to active stores only
  const cleanedSalesOrders = state.salesOrders.filter(so => activeStoreIds.has(so.storeId));
  const cleanedPurchaseOrders = state.purchaseOrders.filter(po => activeStoreIds.has(po.storeId));
  const cleanedExpenses = state.expenses.filter(exp => activeStoreIds.has(exp.storeId));

  return {
    companies: state.companies,
    branches: state.branches,
    stores: state.stores,
    users: cleanedUsers,
    stockItems: cleanedStockItems,
    purchaseOrders: cleanedPurchaseOrders,
    salesOrders: cleanedSalesOrders,
    expenses: cleanedExpenses
  };
}

/**
 * Performs state update cleanup during soft deletion of a Company, Branch, or Store.
 */
export function performCascadeDelete(
  type: 'company' | 'branch' | 'store',
  id: number,
  state: AppState
): Partial<AppState> {
  let updatedCompanies = [...state.companies];
  let updatedBranches = [...state.branches];
  let updatedStores = [...state.stores];

  if (type === 'company') {
    updatedCompanies = state.companies.map(c => c.id === id ? { ...c, isDeleted: true } : c);
    updatedBranches = state.branches.map(b => b.companyId === id ? { ...b, isDeleted: true } : b);
    const branchIds = state.branches.filter(b => b.companyId === id).map(b => b.id);
    updatedStores = state.stores.map(s => branchIds.includes(s.branchId) ? { ...s, isDeleted: true } : s);
  } else if (type === 'branch') {
    updatedBranches = state.branches.map(b => b.id === id ? { ...b, isDeleted: true } : b);
    updatedStores = state.stores.map(s => s.branchId === id ? { ...s, isDeleted: true } : s);
  } else if (type === 'store') {
    updatedStores = state.stores.map(s => s.id === id ? { ...s, isDeleted: true } : s);
  }

  // Run cleanup filters on top of the marked entities
  const filtered = filterActiveData({
    ...state,
    companies: updatedCompanies,
    branches: updatedBranches,
    stores: updatedStores
  });

  return {
    companies: updatedCompanies,
    branches: updatedBranches,
    stores: updatedStores,
    users: filtered.users,
    stockItems: filtered.stockItems,
    salesOrders: filtered.salesOrders,
    purchaseOrders: filtered.purchaseOrders,
    expenses: filtered.expenses
  };
}
