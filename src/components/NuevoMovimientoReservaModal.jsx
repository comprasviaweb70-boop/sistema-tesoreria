import React, { useState, useEffect } from 'react';
import { 
  X, 
  Save, 
  PlusCircle, 
  MinusCircle, 
  Calculator,
  TrendingUp,
  TrendingDown,
  ArrowRightLeft
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useReserva } from '@/hooks/useReserva';
import { useAuth } from '@/contexts/AuthContextObject';
import { supabase } from '@/lib/customSupabaseClient';
import CajaSelector from '@/components/CajaSelector';
import { useToast } from '@/hooks/use-toast';

const DENOMINATIONS = {
  billetes: [
    { key: 'b20k', label: '$ 20.000', value: 20000 },
    { key: 'b10k', label: '$ 10.000', value: 10000 },
    { key: 'b5k', label: '$ 5.000', value: 5000 },
    { key: 'b2k', label: '$ 2.000', value: 2000 },
    { key: 'b1k', label: '$ 1.000', value: 1000 },
  ],
  monedas: [
    { key: 'm500', label: '$ 500', value: 500 },
    { key: 'm100', label: '$ 100', value: 100 },
    { key: 'm50', label: '$ 50', value: 50 },
    { key: 'm10', label: '$ 10', value: 10 },
  ]
};

export function NuevoMovimientoReservaModal({ open, setOpen, onSuccess, movimiento }) {
  const { userProfile } = useAuth();
  const { addMovimiento, updateMovimiento } = useReserva();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [cajaId, setCajaId] = useState('');

  const [formData, setFormData] = useState({
    fecha: new Date().toISOString().split('T')[0],
    turno: 'Mañana',
    tipo: 'ingreso',
    descripcion: '',
    b20k: 0, b10k: 0, b5k: 0, b2k: 0, b1k: 0,
    m500: 0, m100: 0, m50: 0, m10: 0
  });
  const [destinoEsp, setDestinoEsp] = useState('caja'); // 'caja', 'deposito', 'personal'
  const [origenEsp, setOrigenEsp] = useState('caja'); // 'caja', 'cta_cte'

  useEffect(() => {
    if (movimiento) {
      setFormData({
        fecha: movimiento.fecha,
        turno: movimiento.turno,
        tipo: movimiento.tipo,
        descripcion: movimiento.descripcion || '',
        b20k: movimiento.b20k || 0,
        b10k: movimiento.b10k || 0,
        b5k: movimiento.b5k || 0,
        b2k: movimiento.b2k || 0,
        b1k: movimiento.b1k || 0,
        m500: movimiento.m500 || 0,
        m100: movimiento.m100 || 0,
        m50: movimiento.m50 || 0,
        m10: movimiento.m10 || 0,
      });
      setCajaId(movimiento.caja_id || '');
      
      // Inferir destino especial desde descripcion si no hay caja_id
      if (!movimiento.caja_id && movimiento.tipo === 'egreso') {
        if (movimiento.descripcion?.includes('[DEPÓSITO]')) setDestinoEsp('deposito');
        else if (movimiento.descripcion?.includes('[PERSONAL]')) setDestinoEsp('personal');
      } else {
        setDestinoEsp('caja');
      }

      if (!movimiento.caja_id && movimiento.tipo === 'ingreso') {
        if (movimiento.descripcion?.includes('[GIRO CTA CTE]')) setOrigenEsp('cta_cte');
      } else {
        setOrigenEsp('caja');
      }
    } else {
      setFormData({
        fecha: new Date().toISOString().split('T')[0],
        turno: localStorage.getItem('vd_turno') || 'Mañana',
        tipo: 'ingreso',
        descripcion: '',
        b20k: 0, b10k: 0, b5k: 0, b2k: 0, b1k: 0,
        m500: 0, m100: 0, m50: 0, m10: 0
      });
      setCajaId('');
      setDestinoEsp('caja');
      setOrigenEsp('caja');
    }
  }, [movimiento, open]);

  const formatDisplay = (val) => {
    if (!val && val !== 0) return '';
    return val.toLocaleString('es-CL');
  };

  const handleAmountChange = (key, displayValue) => {
    // Eliminar puntos y cualquier carácter no numérico
    const rawValue = displayValue.toString().replace(/\./g, '').replace(/[^0-9]/g, '');
    const numValue = parseInt(rawValue) || 0;
    setFormData(prev => ({ ...prev, [key]: numValue }));
  };

  const totalCalculado = Object.keys(formData)
    .filter(k => k.startsWith('b') || k.startsWith('m'))
    .reduce((acc, key) => acc + (formData[key] || 0), 0);

  const updateVentaDiariaValue = async (targetCajaId, fecha, turno, campo, montoDiff) => {
    if (!targetCajaId || targetCajaId === 'all' || montoDiff === 0) return;

    const { data: venta, error: fetchError } = await supabase
      .from('venta_diaria')
      .select(`id, ${campo}`)
      .eq('fecha', fecha)
      .eq('turno', turno)
      .eq('caja_id', targetCajaId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (venta) {
      const nuevoValor = (parseFloat(venta[campo]) || 0) + montoDiff;
      const { error } = await supabase.from('venta_diaria').update({ [campo]: nuevoValor }).eq('id', venta.id);
      if (error) throw error;
    } else if (montoDiff > 0) {
      // Solo crear si estamos sumando algo (no al restar de un registro que no existe)
      const baseRecord = {
        fecha,
        turno,
        caja_id: targetCajaId,
        cajero_id: userProfile?.id,
        estado: 'Abierto',
        [campo]: montoDiff,
        saldo_inicial: 0, venta_efectivo: 0, redelcom: 0, edenred: 0, transferencia: 0, credito: 0, total_ventas: 0
      };
      const { error } = await supabase.from('venta_diaria').insert([baseRecord]);
      if (error) throw error;
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const isEdit = !!movimiento;
      
      // Ajustar descripcion y cajaId segun destino especial
      let finalDescripcion = formData.descripcion;
      let finalCajaId = (cajaId && cajaId !== 'all') ? cajaId : null;

      if (formData.tipo === 'egreso') {
        if (destinoEsp === 'deposito') {
          finalCajaId = null;
          if (!finalDescripcion.includes('[DEPÓSITO]')) finalDescripcion = `[DEPÓSITO] ${finalDescripcion}`;
        } else if (destinoEsp === 'personal') {
          finalCajaId = null;
          if (!finalDescripcion.includes('[PERSONAL]')) finalDescripcion = `[PERSONAL] ${finalDescripcion}`;
        }
      } else if (formData.tipo === 'ingreso') {
        if (origenEsp === 'cta_cte') {
          finalCajaId = null;
          if (!finalDescripcion.includes('[GIRO CTA CTE]')) finalDescripcion = `[GIRO CTA CTE] ${finalDescripcion}`;
        }
      }

      const finalMovimiento = {
        ...formData,
        descripcion: finalDescripcion,
        monto_total: totalCalculado,
        usuario_id: userProfile?.id,
        caja_id: finalCajaId
      };

      if (isEdit) {
        const result = await updateMovimiento(movimiento.id, finalMovimiento);
        if (result) {
          // 1. Revertir impacto antiguo
          const oldCampo = movimiento.tipo === 'ingreso' ? 'traspaso_tesoreria_egreso' : 'traspaso_tesoreria_ingreso';
          await updateVentaDiariaValue(movimiento.caja_id, movimiento.fecha, movimiento.turno, oldCampo, -movimiento.monto_total);

          // 2. Aplicar impacto nuevo (solo si hay cajaId)
          if (finalCajaId) {
            const newCampo = formData.tipo === 'ingreso' ? 'traspaso_tesoreria_egreso' : 'traspaso_tesoreria_ingreso';
            await updateVentaDiariaValue(finalCajaId, formData.fecha, formData.turno, newCampo, totalCalculado);
          }

          setOpen(false);
          if (onSuccess) onSuccess();
          toast({ title: 'Éxito', description: 'Movimiento actualizado correctamente.' });
        }
      } else {
        const result = await addMovimiento(finalMovimiento);
        if (result) {
          if (finalCajaId) {
            const newCampo = formData.tipo === 'ingreso' ? 'traspaso_tesoreria_egreso' : 'traspaso_tesoreria_ingreso';
            await updateVentaDiariaValue(finalCajaId, formData.fecha, formData.turno, newCampo, totalCalculado);
          }
          
          setOpen(false);
          if (onSuccess) onSuccess();
          toast({ title: 'Éxito', description: 'Movimiento registrado correctamente.' });
        }
      }
    } catch (err) {
      console.error('Error en handleSubmit Reserva:', err);
      toast({ 
        title: 'Error', 
        description: err.message || 'No se pudo completar la operación.', 
        variant: 'destructive' 
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="max-w-4xl glass-card border-white/10 text-foreground overflow-y-auto max-h-[95vh]">
        <DialogHeader className="pb-2">
          <div className="flex justify-between items-center">
            <div>
              <DialogTitle className="text-xl flex items-center gap-2">
                <Calculator className="h-5 w-5 text-primary" /> Nuevo Movimiento de Reserva
              </DialogTitle>
              <DialogDescription>Ingresa los montos por denominación.</DialogDescription>
            </div>
            {totalCalculado > 0 && (
               <div className={`text-2xl font-bold px-4 py-1 rounded-full bg-white/5 border border-white/10 ${formData.tipo === 'egreso' ? 'text-red-400' : 'text-green-400'}`}>
                {formData.tipo === 'egreso' ? '-' : '+'} $ {totalCalculado.toLocaleString('es-CL')}
              </div>
            )}
          </div>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {/* Fila Superior: Datos Generales */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 bg-white/5 p-4 rounded-xl border border-white/10">
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Fecha</Label>
              <Input 
                type="date" 
                value={formData.fecha} 
                onChange={e => setFormData(prev => ({ ...prev, fecha: e.target.value }))} 
                className="glass-input h-9 font-medium [color-scheme:dark] text-foreground/80" 
                required 
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Turno</Label>
              <Select 
                value={formData.turno} 
                onValueChange={v => setFormData(prev => ({ ...prev, turno: v }))}
              >
                <SelectTrigger className="glass-input h-9">
                  <SelectValue placeholder="Seleccione turno" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mañana">Mañana</SelectItem>
                  <SelectItem value="Tarde">Tarde</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">Tipo</Label>
              <div className="flex gap-1 h-9">
                <Button 
                  type="button" 
                  onClick={() => setFormData(prev => ({ ...prev, tipo: 'ingreso' }))} 
                  variant={formData.tipo === 'ingreso' ? 'default' : 'outline'} 
                  className={`flex-1 text-xs h-full ${formData.tipo === 'ingreso' ? 'bg-green-600/80 hover:bg-green-700' : 'glass-button'}`}
                >
                  Ingreso
                </Button>
                <Button 
                  type="button" 
                  onClick={() => setFormData(prev => ({ ...prev, tipo: 'egreso' }))} 
                  variant={formData.tipo === 'egreso' ? 'default' : 'outline'} 
                  className={`flex-1 text-xs h-full ${formData.tipo === 'egreso' ? 'bg-red-600/80 hover:bg-red-700' : 'glass-button'}`}
                >
                  Egreso
                </Button>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs uppercase text-muted-foreground">
                {formData.tipo === 'ingreso' ? 'Caja Origen' : 'Destino de Egreso'}
              </Label>
              {formData.tipo === 'ingreso' ? (
                <Select value={origenEsp} onValueChange={setOrigenEsp}>
                  <SelectTrigger className="glass-input h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="caja">Traspaso de Caja</SelectItem>
                    <SelectItem value="cta_cte">Giro de Cta Cte</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Select value={destinoEsp} onValueChange={setDestinoEsp}>
                  <SelectTrigger className="glass-input h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="caja">Traspaso a Caja</SelectItem>
                    <SelectItem value="deposito">Depósito en Cta Cte</SelectItem>
                    <SelectItem value="personal">Retiro Uso Personal</SelectItem>
                  </SelectContent>
                </Select>
              )}
              </div>
          </div>

          {/* Selector de Caja condicional si es Ingreso desde Caja */}
          {formData.tipo === 'ingreso' && origenEsp === 'caja' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <Label className="text-xs uppercase text-muted-foreground mb-1 block">Seleccione Caja Origen</Label>
              <CajaSelector value={cajaId} onChange={setCajaId} />
            </div>
          )}

          {/* Selector de Caja condicional si es Egreso a Caja */}
          {formData.tipo === 'egreso' && destinoEsp === 'caja' && (
            <div className="animate-in fade-in slide-in-from-top-1 duration-200">
              <Label className="text-xs uppercase text-muted-foreground mb-1 block">Seleccione Caja Destino</Label>
              <CajaSelector value={cajaId} onChange={setCajaId} />
            </div>
          )}

          <div className={`p-2 rounded-lg text-[11px] flex items-center gap-2 border ${
            formData.tipo === 'ingreso' 
              ? 'bg-green-500/5 border-green-500/20 text-green-400/80' 
              : 'bg-red-500/5 border-red-500/20 text-red-400/80'
          }`}>
            <ArrowRightLeft className="h-3.5 w-3.5 shrink-0" />
            <span>
              {formData.tipo === 'ingreso' 
                ? 'Este INGRESO en Reserva se reflejará como una ENTREGA A TESORERÍA (Egreso) en la caja seleccionada.' 
                : 'Este EGRESO de Reserva se reflejará como un TRASPASO RECIBIDO (Ingreso) en la caja seleccionada.'}
            </span>
          </div>

          <div className="space-y-1.5">
            <Label className="text-xs uppercase text-muted-foreground">Descripción / Referencia</Label>
            <Input 
              placeholder="Ej: Saldo inicial, Sobrante de caja..." 
              value={formData.descripcion} 
              onChange={e => setFormData(prev => ({ ...prev, descripcion: e.target.value }))} 
              className="glass-input h-9" 
            />
          </div>

          {/* Grilla de Denominaciones: Horizontal */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Columna Billetes */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-primary flex items-center gap-2 border-b border-primary/20 pb-1">
                <Calculator className="h-3 w-3" /> BILLETES
              </h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {DENOMINATIONS.billetes.map(d => (
                  <div key={d.key} className="p-2 rounded-lg bg-primary/5 border border-primary/10">
                    <Label className="text-[10px] text-primary/70 mb-1 block">{d.label}</Label>
                    <Input 
                      type="text" 
                      placeholder="$ 0" 
                      value={formatDisplay(formData[d.key])} 
                      onChange={e => handleAmountChange(d.key, e.target.value)} 
                      className="glass-input h-8 text-right font-mono text-sm" 
                    />
                    <div className="text-[9px] text-right text-muted-foreground mt-1 min-h-[12px]">
                      {formData[d.key] > 0 ? `${(formData[d.key] / d.value).toFixed(0)} un.` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Columna Monedas */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold text-amber-500 flex items-center gap-2 border-b border-amber-500/20 pb-1">
                <Calculator className="h-3 w-3" /> MONEDAS
              </h3>
              <div className="grid grid-cols-2 gap-3">
                {DENOMINATIONS.monedas.map(d => (
                  <div key={d.key} className="p-2 rounded-lg bg-amber-500/5 border border-amber-500/10">
                    <Label className="text-[10px] text-amber-600/70 mb-1 block">{d.label}</Label>
                    <Input 
                      type="text" 
                      placeholder="$ 0" 
                      value={formatDisplay(formData[d.key])} 
                      onChange={e => handleAmountChange(d.key, e.target.value)} 
                      className="glass-input h-8 text-right font-mono text-sm" 
                    />
                    <div className="text-[9px] text-right text-muted-foreground mt-1 min-h-[12px]">
                      {formData[d.key] > 0 ? `${(formData[d.key] / d.value).toFixed(0)} un.` : ''}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <DialogFooter className="pt-2 border-t border-white/5 gap-2">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)} className="h-10">
              Cancelar
            </Button>
            <Button 
              type="submit" 
              disabled={loading || totalCalculado === 0} 
              className="bg-primary hover:bg-primary/80 text-white min-w-[150px] h-10 shadow-lg shadow-primary/20"
            >
              {loading ? 'Procesando...' : <><Save className="h-4 w-4 mr-2" /> Guardar Movimiento</>}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
