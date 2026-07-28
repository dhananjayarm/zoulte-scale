-- ─────────────────────────────────────────────────────────────────────────────
-- Menu seed for Zoulte WeighStation — module_code = 'WT-SCL', application = 'portal'
-- Tables: mst_menu_master (global master) + mst_menu_access (role → priv join;
-- REQUIRED — the menuaccess query inner-joins it, a menu without access rows
-- never renders).
--
-- Roles used (adjust to the tenant's actual role codes before running):
--   WS_OPERATOR  — weighs & captures            (READ/WRITE on station)
--   WS_VERIFIER  — second-person records review  (APPROVE on verification)
--   WS_ADMIN     — setup & full access           (WRITE everywhere)
-- These must exist in the role master and be assigned to users, or swap the
-- codes below for roles the tenant already has.
--
-- isactive: 1 = screen exists today; 0 = planned screen (Verification,
-- Balance Check, Users) — flip to 1 when the phase ships so links never 404.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Operations ──────────────────────────────────────────────────────────────
INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('scale', '/weightscale', 'Weighing Station', 'Capture product weights from the scale', NULL, 10, 1, 'Operations', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_station = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_station, 'WS_OPERATOR', 'WRITE'),
  (@m_station, 'WS_VERIFIER', 'READ'),
  (@m_station, 'WS_ADMIN',    'WRITE');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('check-circle', '/verification', 'Verification', 'Second-person review & sign-off of captured batches', NULL, 20, 0, 'Operations', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_verify = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_verify, 'WS_VERIFIER', 'APPROVE'),
  (@m_verify, 'WS_ADMIN',    'READ');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('balance', '/balance-check', 'Daily Balance Check', 'Daily scale verification against check weights', NULL, 30, 0, 'Operations', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_balcheck = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_balcheck, 'WS_OPERATOR', 'WRITE'),
  (@m_balcheck, 'WS_ADMIN',    'WRITE');

-- ── Reports (landing page in the sidebar + one REPORT row per report card —
--    the landing page builds its cards from the REPORT rows) ─────────────────
INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('report', '/reports', 'Reports', 'Weighing reports & exports', NULL, 40, 1, 'Reports', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_reports = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_reports, 'WS_VERIFIER', 'READ'),
  (@m_reports, 'WS_ADMIN',    'READ');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('report', '/reports/productReport', 'Product Report', 'All captured weighings in a date range', NULL, 41, 1, 'Reports', 'REPORT', 'report', 'WT-SCL', 'portal');
SET @m_rep_prod = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_rep_prod, 'WS_VERIFIER', 'READ'),
  (@m_rep_prod, 'WS_ADMIN',    'READ');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('report', '/reports/expiryReport', 'Expiry Report', 'Products expiring in a date range', NULL, 42, 1, 'Reports', 'REPORT', 'report', 'WT-SCL', 'portal');
SET @m_rep_exp = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_rep_exp, 'WS_VERIFIER', 'READ'),
  (@m_rep_exp, 'WS_ADMIN',    'READ');

-- ── Setup (ADMIN only) ──────────────────────────────────────────────────────
INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('users', '/setup/users', 'Users', 'Create & manage station users', NULL, 50, 0, 'Setup', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_users = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_users, 'WS_ADMIN', 'WRITE');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('category', '/setup/category', 'Category', 'Product categories', NULL, 51, 1, 'Setup', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_cat = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_cat, 'WS_ADMIN', 'WRITE');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('product', '/setup/product', 'Product', 'Product master', NULL, 52, 1, 'Setup', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_prod = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_prod, 'WS_ADMIN', 'WRITE');

INSERT INTO mst_menu_master (icon, link, name, description, img_url, priority, isactive, header, menu_type, category, module_code, application)
VALUES ('employee', '/setup/employee', 'Employee', 'Employee master (operators & verifiers)', NULL, 53, 0, 'Setup', 'SIDEMENU', NULL, 'WT-SCL', 'portal');
SET @m_emp = LAST_INSERT_ID();

INSERT INTO mst_menu_access (menu_id, role_code, priv_type) VALUES
  (@m_emp, 'WS_ADMIN', 'WRITE');

-- ── Dev convenience (OPTIONAL — uncomment to grant everything to a role the
--    dev tenant already assigns, so menus show before WS_* roles exist) ──────
-- INSERT INTO mst_menu_access (menu_id, role_code, priv_type)
-- SELECT a.menu_id, 'SFA_USER', 'WRITE'
-- FROM mst_menu_master a
-- WHERE a.module_code = 'WT-SCL'
--   AND NOT EXISTS (SELECT 1 FROM mst_menu_access b
--                   WHERE b.menu_id = a.menu_id AND b.role_code = 'SFA_USER');
