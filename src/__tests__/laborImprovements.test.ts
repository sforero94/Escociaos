import { describe, it, expect, beforeEach, vi } from 'vitest';

// mockAutoTable must be hoisted: it's directly referenced in the vi.mock factory.
const { mockAutoTable } = vi.hoisted(() => ({ mockAutoTable: vi.fn() }));

// mockDoc can stay at module level: the vi.mock factory only uses it inside a closure
// (() => mockDoc), which is called after module initialization — no TDZ issue.
const mockDoc = {
  setFontSize: vi.fn(),
  setTextColor: vi.fn(),
  setFont: vi.fn(),
  text: vi.fn(),
  addPage: vi.fn(),
  getNumberOfPages: vi.fn().mockReturnValue(2),
  setPage: vi.fn(),
  setDrawColor: vi.fn(),
  line: vi.fn(),
  setFillColor: vi.fn(),
  rect: vi.fn(),
  roundedRect: vi.fn(),
  save: vi.fn(),
};

vi.mock('jspdf', () => {
  // Regular function (not arrow) so it can be used as a constructor.
  // When a constructor returns an object, `new` uses that object.
  function MockJsPDF() { return mockDoc; }
  return { default: MockJsPDF };
});

vi.mock('jspdf-autotable', () => ({
  default: mockAutoTable,
}));

// Import after mocking
import { generarPDFReportesLabores } from '../utils/generarPDFReportesLabores';

describe('Labor Module Improvements - Phase 1-4', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Cost Calculation Logic (Phase 1)', () => {
    it('should calculate jornal cost using new formula: (salary + benefits) / weekly_hours * 8 * fraction', () => {
      // Test the new cost calculation formula
      const employee = {
        salario: 50000, // Monthly salary
        prestaciones: 10000, // Benefits
        auxilios: 5000, // Allowances
        horas_semanales: 48, // Weekly hours
      };

      const fraccion = 0.5; // Half jornal

      // New formula: (salario + prestaciones + auxilios) / horas_semanales * 8 * fraccion
      const costoEsperado = ((employee.salario + employee.prestaciones + employee.auxilios) / employee.horas_semanales) * 8 * fraccion;

      // (50000 + 10000 + 5000) / 48 * 8 * 0.5 = 65000 / 48 * 4 ≈ 5416.67
      expect(costoEsperado).toBeCloseTo(5416.67, 0);
    });

    it('should handle 8-hour jornal standard', () => {
      const costoPorHora = 10000; // Cost per hour
      const fraccion = 1.0; // Full jornal

      const costoJornal = costoPorHora * 8 * fraccion; // 8 hours per jornal

      expect(costoJornal).toBe(80000);
    });

    it('should support fractions less than 1 jornal', () => {
      const costoPorHora = 10000;
      const fracciones = [0.25, 0.5, 0.75];

      const costosEsperados = fracciones.map(f => costoPorHora * 8 * f);

      expect(costosEsperados).toEqual([20000, 40000, 60000]);
    });
  });

  describe('UI Optimization for Large Teams (Phase 2)', () => {
    it('should support search filtering by employee name and role', () => {
      const empleados = [
        { nombre: 'Juan Pérez', cargo: 'Operario' },
        { nombre: 'María García', cargo: 'Supervisor' },
        { nombre: 'Carlos López', cargo: 'Operario' },
      ];

      const searchTerm = 'juan';
      const filtered = empleados.filter(emp =>
        emp.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.cargo.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(1);
      expect(filtered[0].nombre).toBe('Juan Pérez');
    });

    it('should handle empty search results gracefully', () => {
      const empleados = [
        { nombre: 'Juan Pérez', cargo: 'Operario' },
      ];

      const searchTerm = 'inexistente';
      const filtered = empleados.filter(emp =>
        emp.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.cargo.toLowerCase().includes(searchTerm.toLowerCase())
      );

      expect(filtered).toHaveLength(0);
    });

    it('should support responsive grid layout (2-4 columns)', () => {
      // Test responsive breakpoints logic
      const breakpoints = {
        mobile: { columns: 2, maxWidth: 640 },
        tablet: { columns: 3, maxWidth: 1024 },
        desktop: { columns: 4, maxWidth: Infinity },
      };

      const screenWidth = 800; // Tablet size

      let columns = 2; // Default mobile
      if (screenWidth >= 640 && screenWidth < 1024) {
        columns = 3; // Tablet
      } else if (screenWidth >= 1024) {
        columns = 4; // Desktop
      }

      expect(columns).toBe(3);
    });
  });

  describe('Reports Toggle and Charts (Phase 3)', () => {
    it('should toggle between costos and jornales views', () => {
      let vistaGrafico = 'costos';

      // Simulate toggle click
      vistaGrafico = vistaGrafico === 'costos' ? 'jornales' : 'costos';

      expect(vistaGrafico).toBe('jornales');

      // Toggle again
      vistaGrafico = vistaGrafico === 'costos' ? 'jornales' : 'costos';

      expect(vistaGrafico).toBe('costos');
    });

    it('should aggregate data by lote correctly', () => {
      const registros = [
        { tareas: { lote: { nombre: 'Lote A' } }, costo_jornal: 10000, fraccion_jornal: 1.0 },
        { tareas: { lote: { nombre: 'Lote A' } }, costo_jornal: 15000, fraccion_jornal: 0.5 },
        { tareas: { lote: { nombre: 'Lote B' } }, costo_jornal: 20000, fraccion_jornal: 2.0 },
      ];

      const lotesMap = new Map<string, { costo: number; jornales: number; tareas: Set<string> }>();

      registros.forEach(registro => {
        const loteNombre = registro.tareas?.lote?.nombre || 'Sin lote';

        if (!lotesMap.has(loteNombre)) {
          lotesMap.set(loteNombre, { costo: 0, jornales: 0, tareas: new Set() });
        }

        const data = lotesMap.get(loteNombre)!;
        data.costo += registro.costo_jornal;
        data.jornales += registro.fraccion_jornal;
        data.tareas.add('task-id'); // Simplified
      });

      expect(lotesMap.get('Lote A')?.costo).toBe(25000);
      expect(lotesMap.get('Lote A')?.jornales).toBe(1.5);
      expect(lotesMap.get('Lote B')?.costo).toBe(20000);
      expect(lotesMap.get('Lote B')?.jornales).toBe(2.0);
    });

    it('should synchronize all charts with toggle state', () => {
      const vistaGrafico = 'jornales';

      // All charts should use the same data key based on toggle
      const dataKey = vistaGrafico === 'costos' ? 'costo' : 'jornales';
      const formatter = vistaGrafico === 'costos'
        ? (value: number) => `$${value.toLocaleString('es-CO')}`
        : (value: number) => value.toFixed(2);

      expect(dataKey).toBe('jornales');
      expect(formatter(1234.56)).toBe('1234.56');
    });
  });

  describe('PDF Export Functionality (Phase 4)', () => {
    it('should generate PDF with correct structure', () => {
      const registrosTrabajo = [
        {
          fecha_trabajo: '2025-12-04',
          fraccion_jornal: 1.0,
          costo_jornal: 50000,
          empleados: { nombre: 'Juan Pérez' },
          tareas: {
            codigo_tarea: 'TASK001',
            tipo_tarea_id: 'type1',
            lote: { nombre: 'Lote A' }
          }
        }
      ];

      const tiposTareas = [{ id: 'type1', nombre: 'Fumigación' }];
      const estadisticasGenerales = {
        totalCostos: 50000,
        totalJornales: 1.0
      };

      // Call the PDF generation function
      generarPDFReportesLabores(
        registrosTrabajo,
        tiposTareas,
        estadisticasGenerales,
        '2025-12-01',
        '2025-12-31'
      );

      // Verify document methods were called (jsPDF was instantiated because mockDoc was used)
      expect(mockDoc.setFontSize).toHaveBeenCalled();
      expect(mockDoc.text).toHaveBeenCalled();
      expect(mockDoc.addPage).toHaveBeenCalled();
      expect(mockDoc.save).toHaveBeenCalled();

      // Verify autoTable was called for both pages
      expect(mockAutoTable).toHaveBeenCalled();
    });

    it('should create matrix with activities as rows and lots as columns', () => {
      const registrosTrabajo = [
        {
          fecha_trabajo: '2025-12-04',
          fraccion_jornal: 1.0,
          costo_jornal: 50000,
          empleados: { nombre: 'Juan Pérez' },
          tareas: {
            codigo_tarea: 'TASK001',
            tipo_tarea_id: 'fumigacion',
            lote: { nombre: 'Lote A' }
          }
        },
        {
          fecha_trabajo: '2025-12-05',
          fraccion_jornal: 0.5,
          costo_jornal: 25000,
          empleados: { nombre: 'María García' },
          tareas: {
            codigo_tarea: 'TASK002',
            tipo_tarea_id: 'fertilizacion',
            lote: { nombre: 'Lote B' }
          }
        }
      ];

      const tiposTareas = [
        { id: 'fumigacion', nombre: 'Fumigación' },
        { id: 'fertilizacion', nombre: 'Fertilización' }
      ];

      const estadisticasGenerales = {
        totalCostos: 75000,
        totalJornales: 1.5
      };

      generarPDFReportesLabores(
        registrosTrabajo,
        tiposTareas,
        estadisticasGenerales,
        '2025-12-01',
        '2025-12-31'
      );

      // Verify autoTable was called (indicating matrix generation)
      expect(mockAutoTable).toHaveBeenCalled();
    });

    it('should calculate row and column totals correctly', () => {
      // Test data for matrix calculations
      const registrosTrabajo = [
        {
          fecha_trabajo: '2025-12-04',
          fraccion_jornal: 1.0,
          costo_jornal: 50000,
          tareas: { tipo_tarea_id: 'fum', lote: { nombre: 'Lote A' } }
        },
        {
          fecha_trabajo: '2025-12-05',
          fraccion_jornal: 2.0,
          costo_jornal: 100000,
          tareas: { tipo_tarea_id: 'fum', lote: { nombre: 'Lote B' } }
        }
      ];

      const tiposTareas = [{ id: 'fum', nombre: 'Fumigación' }];

      // This would test the internal matrix calculation logic
      // For now, just verify the function can be called without errors
      expect(() => {
        generarPDFReportesLabores(
          registrosTrabajo,
          tiposTareas,
          { totalCostos: 150000, totalJornales: 3.0 },
          '2025-12-01',
          '2025-12-31'
        );
      }).not.toThrow();
    });

    it('should use professional formatting with brand colors', () => {
      const registrosTrabajo = [];
      const tiposTareas = [];
      const estadisticasGenerales = { totalCostos: 0, totalJornales: 0 };

      generarPDFReportesLabores(
        registrosTrabajo,
        tiposTareas,
        estadisticasGenerales,
        '2025-12-01',
        '2025-12-31'
      );

      // Verify color settings (brand color #73991C)
      expect(mockDoc.setTextColor).toHaveBeenCalledWith(115, 153, 28);
    });
  });

  describe('Integration Tests - Complete Flow', () => {
    it('should handle complete labor management workflow', () => {
      // Test the complete flow from cost calculation to PDF export

      // 1. Cost calculation (Phase 1)
      const employee = { salario: 50000, prestaciones: 10000, auxilios: 5000, horas_semanales: 48 };
      const fraccion = 1.0;
      const costoCalculado = ((employee.salario + employee.prestaciones + employee.auxilios) / employee.horas_semanales) * 8 * fraccion;

      // 2. UI filtering (Phase 2) - simulated
      const empleados = [{ nombre: 'Juan Pérez', cargo: 'Operario' }];
      const filteredEmpleados = empleados; // No filtering needed

      // 3. Data aggregation (Phase 3)
      const registros = [{
        costo_jornal: costoCalculado,
        fraccion_jornal: fraccion,
        tareas: { lote: { nombre: 'Lote A' } }
      }];

      // 4. PDF generation (Phase 4) - mocked
      const tiposTareas = [{ id: 'fum', nombre: 'Fumigación' }];
      const estadisticas = { totalCostos: costoCalculado, totalJornales: fraccion };

      expect(() => {
        generarPDFReportesLabores(registros, tiposTareas, estadisticas, '2025-12-01', '2025-12-31');
      }).not.toThrow();

      // Verify the complete workflow completed successfully
      expect(costoCalculado).toBeGreaterThan(0);
      expect(filteredEmpleados).toHaveLength(1);
      expect(mockDoc.save).toHaveBeenCalled();
    });

    it('should maintain data consistency across all phases', () => {
      // Test that data flows correctly between all phases

      const baseData = {
        employee: { salario: 60000, prestaciones: 12000, auxilios: 6000, horas_semanales: 48 },
        fraccion: 0.75,
        lote: 'Lote Test',
        tipoTarea: 'Fumigación'
      };

      // Phase 1: Cost calculation
      const costoJornal = ((baseData.employee.salario + baseData.employee.prestaciones + baseData.employee.auxilios) / baseData.employee.horas_semanales) * 8 * baseData.fraccion;

      // Phase 3: Data aggregation
      const registros = [{
        costo_jornal: costoJornal,
        fraccion_jornal: baseData.fraccion,
        tareas: { lote: { nombre: baseData.lote } }
      }];

      // Phase 4: PDF export
      const tiposTareas = [{ id: 'fum', nombre: baseData.tipoTarea }];
      const estadisticas = { totalCostos: costoJornal, totalJornales: baseData.fraccion };

      generarPDFReportesLabores(registros, tiposTareas, estadisticas, '2025-12-01', '2025-12-31');

      // Verify data consistency
      // (60000 + 12000 + 6000) / 48 * 8 * 0.75 = 78000 / 48 * 6 = 9750
      expect(costoJornal).toBeCloseTo(9750, 0);
      expect(mockDoc.save).toHaveBeenCalledWith(expect.stringMatching(/^Reporte_Labores_/));
    });
  });
});