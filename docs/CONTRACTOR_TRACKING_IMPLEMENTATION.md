# Contractor Tracking Implementation Summary

## Overview

Successfully implemented contractor tracking functionality for the labor registration system. The system now supports tracking work done by external contractors under two modalities: **Jornal** (day work) and **Contrato** (contract work).

## Implementation Approach

**Full Separation Architecture**: Created a dedicated `contratistas` table separate from employees, with individual contractor identity tracking and flat jornal rate cost structure.

---

## 🎯 What Was Implemented

### 1. Database Schema

**New Table: `contratistas`**
- Individual contractor records with identity (nombre, cedula, telefono)
- Contract type classification (Jornal vs Contrato)
- Flat rate pricing model (tarifa_jornal)
- Status management (Activo/Inactivo)
- Contract duration tracking (fecha_inicio, fecha_fin)

**Modified Table: `registros_trabajo`**
- Added `contratista_id` foreign key
- XOR constraint: each work record must have either `empleado_id` OR `contratista_id` (never both, never neither)
- Performance indexes for contractor queries

**Migration File**: [src/sql/migrations/add_contractor_support.sql](../src/sql/migrations/add_contractor_support.sql)

### 2. TypeScript Types & Interfaces

**File**: [src/components/labores/Labores.tsx](../src/components/labores/Labores.tsx)

Added:
- `Contratista` interface - contractor data structure
- `Trabajador` union type - discriminated union of empleado | contratista
- Updated `RegistroTrabajo` to support optional `empleado_id` and `contratista_id`

### 3. Cost Calculation Logic

**File**: [src/utils/laborCosts.ts](../src/utils/laborCosts.ts)

Added `calculateContractorCost()` function:
- Simple flat rate calculation: `tarifa_jornal × fraction_worked`
- Different from employee calculation (no salary/benefits breakdown)
- Returns hourly rate, daily cost, and total cost

### 4. Contractor Management UI

**New File**: [src/components/empleados/Contratistas.tsx](../src/components/empleados/Contratistas.tsx) (~650 lines)

Features:
- Full CRUD operations (Create, Read, Update, Delete/Inactivate)
- Statistics dashboard (total, active, jornal, contrato counts)
- Search functionality by name
- Filters by estado (Activo/Inactivo) and tipo_contrato
- Form validation with proper error handling
- Visual badges distinguishing Jornal vs Contrato

### 5. Labor Registration Updates

**File**: [src/components/labores/RegistrarTrabajoDialog.tsx](../src/components/labores/RegistrarTrabajoDialog.tsx)

Major refactoring:
- Changed from `selectedEmpleados` to `selectedTrabajadores` (union type)
- **Step 2 Enhancement**: Tabs for "Empleados" vs "Contratistas"
- **Step 3 Enhancement**: Work matrix shows both worker types with badges
- Dual cost calculation logic based on worker type
- Updated submission to set either `empleado_id` OR `contratista_id`
- Enhanced duplicate detection for both employee and contractor records

### 6. Data Loading & Propagation

**File**: [src/components/labores/Labores.tsx](../src/components/labores/Labores.tsx)

Added:
- `contratistas` state management
- `cargarContratistas()` async function
- Passing `contratistas` prop to child components:
  - RegistrarTrabajoDialog
  - ReportesView

### 7. Task Details Display

**File**: [src/components/labores/TareaDetalleDialog.tsx](../src/components/labores/TareaDetalleDialog.tsx)

Updates:
- Query joins with both `empleados` and `contratistas` tables
- Worker name resolution (employee or contractor)
- Visual badges showing contractor type (Jornal/Contrato)

### 8. Reports & Analytics

**File**: [src/components/labores/ReportesView.tsx](../src/components/labores/ReportesView.tsx)

Enhanced reporting:
- Accepts `contratistas` prop
- Query loads both employee and contractor work records
- Unique worker counting (employees + contractors combined)
- Cost aggregation by worker includes contractors with tipo_contrato badge
- Detailed work records table displays contractor information

### 9. Navigation & Routing

**Files Modified**:
- [src/components/Layout.tsx](../src/components/Layout.tsx) - Added "Contratistas" menu item with UserCheck icon
- [src/App.tsx](../src/App.tsx) - Added `/contratistas` route

---

## 📊 Data Flow

### Creating a Contractor
1. User navigates to `/contratistas`
2. Clicks "Nuevo Contratista"
3. Fills form: nombre, tipo_contrato, tarifa_jornal, etc.
4. Record saved to `contratistas` table

### Registering Work
1. User opens RegistrarTrabajoDialog
2. Selects date and task (Step 1)
3. Switches to "Contratistas" tab (Step 2)
4. Selects contractor(s)
5. Assigns jornal fractions per lote (Step 3)
6. System calculates cost using `calculateContractorCost()`
7. Record saved to `registros_trabajo` with `contratista_id`

### Viewing Reports
1. System loads all work records (employees + contractors)
2. Joins with both `empleados` and `contratistas` tables
3. Aggregates costs by worker
4. Displays contractor names with tipo_contrato badges
5. Counts unique workers across both types

---

## 🔑 Key Design Decisions

1. **Separate Table**: Chose dedicated `contratistas` table for clean separation and future extensibility
2. **XOR Constraint**: Database-level enforcement that each work record has exactly one worker type
3. **Union Types**: TypeScript discriminated unions for type-safe worker handling
4. **Flat Rate Model**: Contractors use simple jornal rate, employees use complex salary breakdown
5. **Visual Distinction**: Badges throughout UI clearly show contractor type
6. **Individual Identity**: Each contractor is a named entity (not aggregate tracking)

---

## 🧪 Testing Checklist

### Database Migration
- [ ] Run migration script successfully
- [ ] Verify `contratistas` table exists
- [ ] Verify `contratista_id` column added to `registros_trabajo`
- [ ] Verify `check_worker_type` constraint exists
- [ ] Test constraint: Try inserting record with both IDs (should fail)
- [ ] Test constraint: Try inserting record with neither ID (should fail)

### Contractor Management
- [ ] Navigate to `/contratistas`
- [ ] Create new Jornal contractor
- [ ] Create new Contrato contractor
- [ ] Edit contractor information
- [ ] Search contractors by name
- [ ] Filter by estado (Activo/Inactivo)
- [ ] Filter by tipo_contrato (Jornal/Contrato)
- [ ] Inactivate a contractor
- [ ] Verify statistics cards update correctly

### Labor Registration
- [ ] Open RegistrarTrabajoDialog
- [ ] Switch to "Contratistas" tab in Step 2
- [ ] Select multiple contractors
- [ ] Assign jornal fractions in Step 3
- [ ] Verify cost calculation shows correctly
- [ ] Submit and verify record created
- [ ] Verify duplicate detection works for contractors
- [ ] Mix employees and contractors in same task

### Reports & Display
- [ ] View Reportes tab in Labores
- [ ] Verify contractor work shows with badges
- [ ] Check cost aggregation includes contractors
- [ ] Verify worker count includes both types
- [ ] Open TareaDetalleDialog for task with contractor work
- [ ] Verify contractor names display with badges
- [ ] Export report (if applicable) and verify contractor data

### Edge Cases
- [ ] Register work with only contractors (no employees)
- [ ] Register work with only employees (no contractors)
- [ ] Register mixed (employees + contractors) work
- [ ] Edit task with contractor work records
- [ ] Delete contractor (should be prevented if has work records)
- [ ] Inactivate contractor with existing work records
- [ ] View reports filtered by date range including contractor work

---

## 📁 Files Modified/Created

### Created
- `src/sql/migrations/add_contractor_support.sql` - Database migration
- `src/components/empleados/Contratistas.tsx` - Contractor management UI
- `src/sql/migrations/run_migration.js` - Migration runner script
- `src/sql/migrations/README_MIGRATION.md` - Migration instructions
- `docs/CONTRACTOR_TRACKING_IMPLEMENTATION.md` - This file

### Modified
- `src/components/labores/Labores.tsx` - Added Contratista types and data loading
- `src/utils/laborCosts.ts` - Added contractor cost calculation
- `src/components/labores/RegistrarTrabajoDialog.tsx` - Refactored for dual worker types
- `src/components/labores/TareaDetalleDialog.tsx` - Display contractor work
- `src/components/labores/ReportesView.tsx` - Include contractors in reports
- `src/components/Layout.tsx` - Added navigation menu item
- `src/App.tsx` - Added route

---

## 🚀 Next Steps

1. **Run Database Migration** (REQUIRED)
   - Follow instructions in [src/sql/migrations/README_MIGRATION.md](../src/sql/migrations/README_MIGRATION.md)
   - Verify migration success before testing

2. **End-to-End Testing**
   - Follow testing checklist above
   - Test all user flows

3. **Production Deployment**
   - Run migration on production database
   - Deploy code changes
   - Monitor for errors

4. **Future Enhancements** (Optional)
   - Contractor payment tracking
   - Contract document uploads
   - Contractor performance metrics
   - Batch contractor work registration
   - Contractor-specific reports

---

## 💡 Cost Calculation Examples

### Employee Cost
```
Salary: $2,000,000/month
Benefits: $500,000/month
Weekly hours: 48
Fraction: 1.0 jornal

Monthly hours = 48 × 4.33 = 207.84
Hourly rate = ($2,000,000 + $500,000) / 207.84 = $12,028/hour
Daily cost = $12,028 × 8 = $96,224
Total cost = $96,224 × 1.0 = $96,224
```

### Contractor Cost
```
Tarifa jornal: $80,000
Fraction: 1.0 jornal

Daily cost = $80,000
Total cost = $80,000 × 1.0 = $80,000
```

---

## 📞 Support

If you encounter issues:
1. Check browser console for JavaScript errors
2. Check Supabase logs for database errors
3. Verify migration ran successfully
4. Review TypeScript compilation errors
5. Check network tab for API failures

---

**Implementation Date**: January 6, 2026
**Status**: ✅ Complete (Pending Migration & Testing)
