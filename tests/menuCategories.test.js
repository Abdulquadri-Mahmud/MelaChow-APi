import { beforeEach, expect, it, jest } from '@jest/globals';
const list = jest.fn(), find = jest.fn();
jest.unstable_mockModule('../services/postgres/locationCategory.repository.js', () => ({ locationCategoryRepository: { listCategoriesWithParent: list } }));
jest.unstable_mockModule('../model/category.model.js', () => ({ default: { find } }));
const { getPlatformCategories } = await import('../controller/menu/platformCategories.controller.js');
const response = () => { const res = { status: jest.fn(), json: jest.fn() }; res.status.mockReturnValue(res); return res; };
beforeEach(() => { jest.clearAllMocks(); process.env.POSTGRES_MIGRATION_ENABLED = 'true'; process.env.DB_PRIMARY_PROVIDER = 'postgres'; process.env.DB_READ_PROVIDER = 'mongo'; process.env.DB_MENU_READ_PROVIDER = 'mongo'; });
it('uses PostgreSQL when it is primary, without querying disconnected MongoDB', async () => {
    list.mockResolvedValue([{ id: 'rice-uuid', name: 'Rice', parentId: 'food-uuid', parent: { id: 'food-uuid', name: 'Food' } }]);
    const res = response(); await getPlatformCategories({}, res);
    expect(find).not.toHaveBeenCalled(); expect(list).toHaveBeenCalledTimes(1); expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({ success: true, categories: [expect.objectContaining({ _id: 'rice-uuid', parent: { _id: 'food-uuid', id: 'food-uuid', name: 'Food' } })] });
});
it('supports a gradual migration with PostgreSQL menu reads', async () => {
    process.env.DB_PRIMARY_PROVIDER = 'mongo'; process.env.DB_MENU_READ_PROVIDER = 'postgres'; list.mockResolvedValue([]);
    const res = response(); await getPlatformCategories({}, res); expect(list).toHaveBeenCalled(); expect(find).not.toHaveBeenCalled();
});
it('preserves active-only Mongo categories for non-migrated deployments', async () => {
    process.env.DB_PRIMARY_PROVIDER = 'mongo'; const query = { populate: jest.fn(), sort: jest.fn(), lean: jest.fn().mockResolvedValue([{ _id: 'old', name: 'Rice' }]) }; query.populate.mockReturnValue(query); query.sort.mockReturnValue(query); find.mockReturnValue(query);
    const res = response(); await getPlatformCategories({}, res); expect(find).toHaveBeenCalledWith({ isActive: true }); expect(list).not.toHaveBeenCalled(); expect(res.status).toHaveBeenCalledWith(200);
});
it('returns a retryable error without leaking database internals', async () => {
    list.mockRejectedValue(new Error('private database detail')); const log = jest.spyOn(console, 'error').mockImplementation(() => {});
    const res = response(); await getPlatformCategories({}, res); expect(res.status).toHaveBeenCalledWith(500); expect(res.json).toHaveBeenCalledWith({ success: false, message: expect.not.stringContaining('private') }); log.mockRestore();
});
