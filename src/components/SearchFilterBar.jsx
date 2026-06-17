
import React, { useState, useEffect } from 'react';
import { Search, Calendar, User, Clock, Trash2, AlertCircle, LayoutDashboard } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';

const SearchFilterBar = ({ onSearch, results = [], onDelete, historyPrevShiftClosures = {} }) => {
  const [fechaDesde, setFechaDesde] = useState('');
  const [fechaHasta, setFechaHasta] = useState('');
  const [cajeroId, setCajeroId] = useState('all-users');
  const [turno, setTurno] = useState('all-shifts');
  const [cajaId, setCajaId] = useState('all-cajas');
  const [cajeros, setCajeros] = useState([]);
  const [cajas, setCajas] = useState([]);
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    fetchCajeros();
    fetchCajas();
  }, []);

  const fetchCajas = async () => {
    try {
      const { data, error } = await supabase
        .from('cajas')
        .select('id, nombre')
        .eq('activo', true)
        .order('nombre');
      
      if (error) throw error;
      
      if (data && data.length > 0) {
        setCajas(data);
      } else {
        // Fallback to usuarios with role 'cajero' if no boxes defined (same logic as CajaSelector)
        const { data: userData, error: userError } = await supabase
          .from('usuarios')
          .select('id, nombre, nombre_completo')
          .ilike('rol', 'cajero')
          .order('nombre');
        
        if (userError) throw userError;
        
        const transformed = (userData || []).map(u => ({
          id: u.id,
          nombre: u.nombre || u.nombre_completo
        }));
        setCajas(transformed);
      }
    } catch (error) {
      console.error('Error fetching cajas:', error);
    }
  };

  const fetchCajeros = async () => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('id, nombre_completo')
        .order('nombre_completo');
      if (error) throw error;
      setCajeros(data || []);
    } catch (error) {
      console.error('Error fetching cajeros:', error);
    }
  };

  const handleSearch = () => {
    onSearch({
      fechaDesde,
      fechaHasta,
      cajeroId: cajeroId === 'all-users' ? '' : cajeroId,
      cajaId: cajaId === 'all-cajas' ? '' : cajaId,
      turno: turno === 'all-shifts' ? '' : turno,
    });
  };

  const handleReset = () => {
    setFechaDesde('');
    setFechaHasta('');
    setCajeroId('all-users');
    setCajaId('all-cajas');
    setTurno('all-shifts');
    onSearch({});
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase
        .from('venta_diaria')
        .delete()
        .eq('id', confirmDeleteId);
      if (error) throw error;
      if (onDelete) onDelete(confirmDeleteId);
    } catch (err) {
      console.error('Error deleting record:', err);
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  const formatCurrency = (val) =>
    val != null ? `$${parseFloat(val).toLocaleString('es-CL')}` : '-';

  const calculateDiferencia = (rec) => {
    const saldo_inicial = parseFloat(rec.saldo_inicial) || 0;
    const efectivo_bruto = parseFloat(rec.venta_efectivo) || 0;
    const vuelto = parseFloat(rec.vuelta) || 0;
    const venta_efectiva_neta = efectivo_bruto - vuelto;
    
    const traspaso_recibido = parseFloat(rec.traspaso_tesoreria_ingreso) || 0;
    const entrega_tesoreria = parseFloat(rec.traspaso_tesoreria_egreso) || 0;
    const subtotal_ingresos = traspaso_recibido + (parseFloat(rec.ingresos_efectivo) || 0);

    const sumEgresosOperativos = 
      (parseFloat(rec.pago_facturas_caja) || 0) +
      (parseFloat(rec.gastos_rrhh) || 0) +
      (parseFloat(rec.servicios) || 0) +
      (parseFloat(rec.gastos) || 0) +
      (parseFloat(rec.correccion_boletas) || 0) +
      (parseFloat(rec.otros_egresos) || 0);
    
    const total_egresos = sumEgresosOperativos + entrega_tesoreria;
    const cierre_caja_sistema = saldo_inicial + venta_efectiva_neta + subtotal_ingresos - total_egresos;
    const cierre_declarado_pdf = parseFloat(rec.cierre_declarado_pdf) || 0;
    
    return cierre_declarado_pdf - cierre_caja_sistema;
  };

  const recordToDelete = results.find((r) => r.id === confirmDeleteId);

  return (
    <div className="space-y-4">
      {/* Filtros */}
      <div className="glass-card p-4 transition-all duration-300">
        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
          <div className="space-y-2">
            <Label htmlFor="fechaDesde" className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 accent-text" />
              Fecha Desde
            </Label>
            <Input
              id="fechaDesde"
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              className="glass-input font-medium [color-scheme:dark] text-foreground/80"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="fechaHasta" className="text-sm font-medium flex items-center gap-2">
              <Calendar className="h-4 w-4 accent-text" />
              Fecha Hasta
            </Label>
            <Input
              id="fechaHasta"
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              className="glass-input font-medium [color-scheme:dark] text-foreground/80"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="cajero" className="text-sm font-medium flex items-center gap-2">
              <User className="h-4 w-4 accent-text" />
              Cajero
            </Label>
            <Select value={cajeroId} onValueChange={(v) => v && setCajeroId(v)}>
              <SelectTrigger id="cajero">
                <SelectValue placeholder="Todos los cajeros" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-users">Todos los cajeros</SelectItem>
                {cajeros.map((cajero) => (
                  <SelectItem key={cajero.id} value={cajero.id}>
                    {cajero.nombre_completo || 'Usuario sin nombre'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="caja-filter" className="text-sm font-medium flex items-center gap-2">
              <LayoutDashboard className="h-4 w-4 accent-text" />
              Caja
            </Label>
            <Select value={cajaId} onValueChange={(v) => v && setCajaId(v)}>
              <SelectTrigger id="caja-filter">
                <SelectValue placeholder="Todas las cajas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-cajas">Todas las cajas</SelectItem>
                {cajas.map((caja) => (
                  <SelectItem key={caja.id} value={caja.id}>
                    {caja.nombre}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="turno" className="text-sm font-medium flex items-center gap-2">
              <Clock className="h-4 w-4 accent-text" />
              Turno
            </Label>
            <Select value={turno} onValueChange={(v) => v && setTurno(v)}>
              <SelectTrigger id="turno">
                <SelectValue placeholder="Todos los turnos" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all-shifts">Todos los turnos</SelectItem>
                <SelectItem value="Mañana">Mañana</SelectItem>
                <SelectItem value="Tarde">Tarde</SelectItem>

              </SelectContent>
            </Select>
          </div>

          <div className="flex items-end gap-2">
            <Button onClick={handleSearch} className="flex-1 accent-button px-2">
              <Search className="mr-1 h-4 w-4" />
              Buscar
            </Button>
            <Button onClick={handleReset} variant="outline" className="border-border text-foreground hover:bg-secondary/50 px-2">
              Reset
            </Button>
          </div>
        </div>
      </div>

      {/* Tabla de resultados */}
      {results.length > 0 && (
        <div className="glass-card overflow-hidden">
          <div className="p-3 border-b border-border/50 bg-secondary/50 flex items-center justify-between">
            <h4 className="text-sm font-semibold text-foreground">
              {results.length} registro(s) encontrado(s)
            </h4>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="border-border hover:bg-transparent">
                  <TableHead className="font-semibold">Fecha</TableHead>
                  <TableHead className="font-semibold">Caja</TableHead>
                  <TableHead className="font-semibold">Turno</TableHead>
                  <TableHead className="font-semibold">Estado</TableHead>
                   <TableHead className="font-semibold text-right">Saldo Inicial</TableHead>
                  <TableHead className="font-semibold text-right">Total Ventas</TableHead>
                  <TableHead className="font-semibold text-right">Cierre Declarado</TableHead>
                  <TableHead className="font-semibold text-right">Diferencia</TableHead>
                  <TableHead className="font-semibold text-center w-[80px]">Eliminar</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map((rec) => (
                  <TableRow key={rec.id} className="hover:bg-secondary/30 transition-colors">
                    <TableCell className="font-medium whitespace-nowrap">{rec.fecha}</TableCell>
                    <TableCell className="font-medium text-primary">
                      {cajas.find(c => c.id === rec.caja_id)?.nombre || rec.caja_id || '-'}
                    </TableCell>
                    <TableCell>{rec.turno}</TableCell>
                    <TableCell>
                      <span className={`text-xs font-semibold px-2 py-0.5 rounded ${
                        rec.estado === 'Cerrado'
                          ? 'bg-primary/20 accent-text border border-primary/30'
                          : 'bg-green-500/10 text-green-400 border border-green-500/30'
                      }`}>
                        {rec.estado}
                      </span>
                    </TableCell>
                    <TableCell className="text-right font-mono relative">
                      <div className="flex items-center justify-end gap-1">
                        {historyPrevShiftClosures[rec.id] && 
                         historyPrevShiftClosures[rec.id].length > 0 &&
                         !historyPrevShiftClosures[rec.id].includes(rec.saldo_inicial) && (
                          <AlertCircle 
                            className="h-4 w-4 text-orange-400" 
                            title={`Discrepancia: Ningún cierre anterior coincide. Registrados: ${historyPrevShiftClosures[rec.id].map(v => formatCurrency(v)).join(', ')}`} 
                          />
                        )}
                        <span>{formatCurrency(rec.saldo_inicial)}</span>
                      </div>
                    </TableCell>
                     <TableCell className="text-right font-mono">{formatCurrency(rec.total_ventas)}</TableCell>
                    <TableCell className="text-right font-mono">{formatCurrency(rec.cierre_declarado_pdf)}</TableCell>
                    <TableCell className="text-right font-mono">
                      <span className={
                        calculateDiferencia(rec) >= 0 && calculateDiferencia(rec) <= 1000 
                          ? 'text-green-400' 
                          : calculateDiferencia(rec) > 1000 
                            ? 'accent-text font-bold' 
                            : 'text-red-400 font-bold'
                      }>
                        {formatCurrency(calculateDiferencia(rec))}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeleteId(rec.id)}
                        className="h-8 w-8 p-0 hover:bg-red-500/20 hover:text-red-400 text-muted-foreground transition-colors"
                        title="Eliminar registro"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </div>
      )}

      {/* Dialog de confirmación de eliminación */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar este registro?</DialogTitle>
            <DialogDescription>
              {recordToDelete && (
                <>
                  Se eliminará el registro del <strong>{recordToDelete.fecha}</strong> — turno{' '}
                  <strong>{recordToDelete.turno}</strong>. Esta acción no se puede deshacer.
                </>
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => setConfirmDeleteId(null)}
              disabled={isDeleting}
              className="border-border text-foreground hover:bg-secondary"
            >
              Cancelar
            </Button>
            <Button
              onClick={handleConfirmDelete}
              disabled={isDeleting}
              className="bg-red-500 hover:bg-red-600 text-white"
            >
              {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SearchFilterBar;
