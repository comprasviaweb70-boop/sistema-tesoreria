
import React from 'react';
import { Lock, CheckCircle, RefreshCcw, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useAuth } from '@/contexts/AuthContextObject';

const SummaryPanel = ({ ventaData, onCerrarDia, onReabrirDia, canClose, canEdit, onFieldChange, onLoadPreviousSaldo, prevShiftClosures = [] }) => {
  const { isAdministrador, isSupervisor } = useAuth();

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('es-CL', {
      style: 'currency',
      currency: 'CLP',
    }).format(value || 0);
  };

  const getDiferenciaColor = (diferencia) => {
    if (diferencia >= 0 && diferencia <= 1000) return 'text-green-400';
    if (diferencia > 1000) return 'accent-text';
    return 'text-red-400';
  };

  const totalVentas = ventaData?.total_ventas || 0;

  const saldoInicial = parseFloat(ventaData?.saldo_inicial) || 0;
  const ventaEfectivaNeta = parseFloat(ventaData?.venta_efectiva_neta) || 0;
  const traspasoRecibido = parseFloat(ventaData?.traspaso_tesoreria_ingreso) || 0;
  const entregaTesoreria = parseFloat(ventaData?.traspaso_tesoreria_egreso) || 0;

  const subtotalIngresos = traspasoRecibido + (parseFloat(ventaData?.ingresos_efectivo) || 0);

  const totalEgresos = 
    (parseFloat(ventaData?.pago_facturas_caja) || 0) +
    (parseFloat(ventaData?.gastos_rrhh) || 0) +
    (parseFloat(ventaData?.servicios) || 0) +
    (parseFloat(ventaData?.gastos) || 0) +
    (parseFloat(ventaData?.correccion_boletas) || 0) +
    (parseFloat(ventaData?.otros_egresos) || 0) +
    entregaTesoreria;

  // Total Efectivo Teórico
  const totalEfectivoTeorico = 
    saldoInicial + 
    ventaEfectivaNeta + 
    subtotalIngresos - 
    totalEgresos;

  const cierreRealCaja = parseFloat(ventaData?.cierre_declarado_pdf) || 0;
  const diferenciaFinal = cierreRealCaja - totalEfectivoTeorico;

  return (
    <Card className="h-fit sticky top-20 glass-card">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg text-foreground border-b border-border pb-2">Resumen de Caja del Día</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-3">
          
          <div className="flex justify-between items-center pb-2 border-b border-border/30 pt-2">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Saldo Inicial</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadPreviousSaldo}
                className="h-5 w-5 p-0 hover:bg-primary/20"
                title="Cargar saldo del cierre anterior"
              >
                <RefreshCcw className="h-3 w-3 text-primary" />
              </Button>
            </div>
            <div className="w-1/2 flex justify-end">
              <Input
                 type="number"
                 value={saldoInicial || ''}
                 onChange={(e) => onFieldChange && onFieldChange('saldo_inicial', e.target.value)}
                 onBlur={(e) => onFieldChange && onFieldChange('saldo_inicial', e.target.value)}
                 disabled={!canEdit}
                 className="text-right glass-input w-[120px] font-bold h-8 text-sm"
                 step="0.01"
               />
            </div>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-border/30">
            <span className="text-sm text-green-400/80">+ Venta Efectiva Neta</span>
            <span className="text-sm font-semibold text-green-400/80">
              {formatCurrency(ventaEfectivaNeta)}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-border/30">
            <span className="text-sm text-green-400/80">+ Total Ingresos</span>
            <span className="text-sm font-semibold text-green-400/80">
              {formatCurrency(subtotalIngresos)}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-border/30">
            <span className="text-sm text-red-400/80">- Total Egresos</span>
            <span className="text-sm font-semibold text-red-400/80">
              {formatCurrency(totalEgresos)}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b-2 border-border/50 bg-secondary/20 p-2 rounded-md">
            <span className="text-sm font-bold text-foreground">Total Efectivo Teórico</span>
            <span className="text-sm font-bold text-foreground">
              {formatCurrency(totalEfectivoTeorico)}
            </span>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-border/30 pt-2">
            <span className="text-sm text-muted-foreground w-1/2">Cierre Declarado PDF (Caja Real)</span>
            <div className="w-1/2 flex justify-end">
              <Input
                 type="number"
                 value={cierreRealCaja || ''}
                 onChange={(e) => onFieldChange && onFieldChange('cierre_declarado_pdf', e.target.value)}
                 onBlur={(e) => onFieldChange && onFieldChange('cierre_declarado_pdf', e.target.value)}
                 disabled={!canEdit}
                 className="text-right glass-input w-[120px] font-bold h-8 text-sm"
                 step="0.01"
               />
            </div>
          </div>

          <div className="flex justify-between items-center pb-2 border-b border-border/30">
            <span className="text-sm font-bold text-foreground">Diferencia Final de Caja</span>
            <span className={`text-sm font-bold ${getDiferenciaColor(diferenciaFinal)}`}>
              {formatCurrency(diferenciaFinal)}
            </span>
          </div>

          {diferenciaFinal !== 0 && (
            <div className={`mt-2 p-3 text-center rounded-md border font-semibold ${
              diferenciaFinal > 0 
                ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                : 'bg-red-500/10 text-red-400 border-red-500/30'
            }`}>
              {diferenciaFinal > 0 ? 'Excedente de Caja' : 'Faltante de Caja'}
            </div>
          )}

          {prevShiftClosures.length > 0 && !prevShiftClosures.includes(saldoInicial) && (
            <div className="mt-2 p-3 text-center rounded-md border border-orange-500/30 bg-orange-500/10 text-orange-400 text-xs font-semibold">
              <div className="flex items-center justify-center gap-2 mb-1">
                <AlertCircle className="h-4 w-4" />
                <span>Discrepancia Turno Anterior</span>
              </div>
              <p className="font-normal opacity-90">
                El saldo inicial no coincide con ningún cierre del turno anterior. 
                Saldos de cierre registrados: {prevShiftClosures.map(v => formatCurrency(v)).join(', ')}
              </p>
            </div>
          )}

          <div className="flex justify-between items-center pt-4">
            <span className="text-sm font-medium text-foreground">Estado</span>
            <span className={`text-sm font-semibold px-3 py-1 rounded-full ${ventaData?.estado === 'Cerrado'
                ? 'bg-primary/20 accent-text border border-primary/30'
                : 'bg-secondary/50 text-muted-foreground border border-border'
              }`}>
              {ventaData?.estado || 'Abierto'}
            </span>
          </div>
        </div>

        {ventaData?.estado !== 'Cerrado' && (
          <Button
            onClick={onCerrarDia}
            className="w-full accent-button mt-4"
          >
            <CheckCircle className="mr-2 h-4 w-4" />
            Cerrar Día
          </Button>
        )}

        {ventaData?.estado === 'Cerrado' && (
          <div className="bg-primary/10 border border-primary/30 rounded-lg p-3 flex flex-col gap-3 mt-4 glass-card">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 accent-text" />
              <span className="text-sm accent-text font-medium">Día Cerrado</span>
            </div>
            {ventaData?.estado === 'Cerrado' && onReabrirDia && (
              <Button
                onClick={onReabrirDia}
                variant="outline"
                size="sm"
                className="w-full border-primary/50 text-primary hover:bg-primary/10"
              >
                Abrir Día
              </Button>
            )}
          </div>
        )}


      </CardContent>
    </Card>
  );
};

export default SummaryPanel;
