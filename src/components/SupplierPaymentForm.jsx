
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, Banknote, CreditCard } from 'lucide-react';
import CajaSelector from '@/components/CajaSelector';
import { useAuth } from '@/contexts/AuthContextObject';
import { recalculateVentaDiaria } from '@/utils/ventaDiariaSync';

const SupplierPaymentForm = ({ onSuccess, globalCajaId, setGlobalCajaId, refreshTrigger }) => {
  const { user, userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [proveedores, setProveedores] = useState([]);
  const [availableCajas, setAvailableCajas] = useState([]);

  const [formData, setFormData] = useState({
    proveedor_id: '',
    fecha_pago: new Date().toISOString().split('T')[0],
    monto_pagado: '',
    origen_fondos: 'caja',   // 'caja' (efectivo) | 'cuenta_corriente'
    turno: localStorage.getItem('vd_turno') || 'Mañana',
  });

  const fetchProveedores = async () => {
    const { data } = await supabase.from('proveedores').select('id, nombre').eq('activo', true).order('nombre');
    if (data) setProveedores(data);
  };

  const fetchCajas = async () => {
    const { data } = await supabase.from('cajas').select('id, nombre').eq('activo', true).limit(1);
    if (data) setAvailableCajas(data);
  };

  useEffect(() => {
    fetchProveedores();
    fetchCajas();
  }, [refreshTrigger]);

  const handleChange = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Sincroniza el pago con el registro de venta_diaria correspondiente.
   * Si es efectivo -> suma a pago_facturas_caja.
   * Si es CC -> suma a pago_facturas_cc.
   */
  const syncToVentaDiaria = async (cajaId) => {
    const monto = parseFloat(formData.monto_pagado) || 0;
    if (monto <= 0) return null;

    console.log(`Sincronizando pago de proveedor a venta_diaria:`, {
      fecha: formData.fecha_pago,
      turno: formData.turno,
      caja_id: cajaId,
    });

    // Usar la utilidad robusta para recalcular todo el registro
    const result = await recalculateVentaDiaria(supabase, formData.fecha_pago, formData.turno, cajaId);
    
    // Devolvemos el cajero_id si ya existía el registro (para guardarlo en el pago si es necesario)
    // Pero en realidad, el pago se guarda DESPUÉS, así que esto es opcional.
    if (result && result.id) {
       const { data } = await supabase.from('venta_diaria').select('cajero_id').eq('id', result.id).single();
       return data?.cajero_id || null;
    }
    return null;
  };

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    const isCC = formData.origen_fondos === 'cuenta_corriente';
    const esEfectivo = !isCC;
    
    // Si es CC, intentamos usar la caja seleccionada. Si no hay una (está en 'Todas'),
    // usamos la primera caja disponible como referencia técnica para evitar errores de FK y RLS.
    let effectiveCajaId = esEfectivo ? globalCajaId : (globalCajaId && globalCajaId !== 'all' ? globalCajaId : (availableCajas?.[0]?.id || userProfile?.id || user?.id));

    if (esEfectivo && (!effectiveCajaId || effectiveCajaId === 'all')) {
      toast({ title: 'Error', description: 'Debe seleccionar una caja específica.', variant: 'destructive' });
      return;
    }
    
    if (!effectiveCajaId) {
       toast({ title: 'Error', description: 'No se pudo identificar una caja de referencia para el registro. Por favor, asegúrese de tener al menos una caja creada.', variant: 'destructive' });
       return;
    }

    if (!formData.proveedor_id) {
      toast({ title: 'Error', description: 'Debe seleccionar un proveedor.', variant: 'destructive' });
      return;
    }
    if (!formData.monto_pagado || parseFloat(formData.monto_pagado) <= 0) {
      toast({ title: 'Error', description: 'Ingrese un monto válido.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      // Check for duplicates
      const { data: duplicates, error: dupError } = await supabase
        .from('pagos_proveedor')
        .select('id')
        .eq('fecha_pago', formData.fecha_pago)
        .eq('monto_pagado', parseFloat(formData.monto_pagado))
        .eq('proveedor_id', formData.proveedor_id)
        .limit(1);
      
      if (dupError) throw dupError;
      
      if (duplicates && duplicates.length > 0) {
        const confirmDup = window.confirm(`¡Atención! Ya existe un pago registrado hoy a este proveedor por $${parseFloat(formData.monto_pagado).toLocaleString('es-CL')}. ¿Deseas registrar este pago de todas formas?`);
        if (!confirmDup) {
          setLoading(false);
          return;
        }
      }

      // Sincronizar con venta_diaria (Caja o CC)
      const cajero_id = await syncToVentaDiaria(effectiveCajaId);

      const { error: insertError } = await supabase
        .from('pagos_proveedor')
        .insert([{
          proveedor_id: formData.proveedor_id,
          cajero_id,
          caja_id: effectiveCajaId,
          fecha_pago: formData.fecha_pago,
          monto_pagado: parseFloat(formData.monto_pagado),
          origen_fondos: formData.origen_fondos,
          turno: formData.turno,
        }]);

      if (insertError) throw insertError;

      toast({
        title: 'Pago registrado',
        description: formData.origen_fondos === 'caja'
          ? 'Descontado del efectivo de caja.'
          : 'Registrado en Cuenta Corriente.',
        className: 'bg-green-500/10 text-green-500 border-green-500/50',
      });

      setFormData(prev => ({ ...prev, proveedor_id: '', monto_pagado: '' }));
      if (onSuccess) onSuccess();

    } catch (error) {
      console.error('Error al procesar el pago:', error);
      toast({ title: 'Error al procesar el pago', description: error.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const esEfectivo = formData.origen_fondos === 'caja';

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Registrar Pago a Proveedor</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Tipo de pago */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleChange('origen_fondos', 'caja')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all font-medium text-sm ${
                esEfectivo
                  ? 'border-primary bg-primary/10 accent-text'
                  : 'border-border bg-background text-muted-foreground hover:border-primary/50'
              }`}
            >
              <Banknote className="h-5 w-5" />
              Efectivo
            </button>
            <button
              type="button"
              onClick={() => handleChange('origen_fondos', 'cuenta_corriente')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all font-medium text-sm ${
                !esEfectivo
                  ? 'border-blue-500 bg-blue-500/10 text-blue-400'
                  : 'border-border bg-background text-muted-foreground hover:border-blue-500/50'
              }`}
            >
              <CreditCard className="h-5 w-5" />
              Cuenta Corriente
            </button>
          </div>

          {esEfectivo && (
            <div className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/30 rounded-md px-3 py-2">
              ⚠️ Este pago se descontará del <strong>efectivo de caja</strong>.
            </div>
          )}
          {!esEfectivo && (
            <div className="text-xs text-blue-400 bg-blue-500/10 border border-blue-500/30 rounded-md px-3 py-2">
              ℹ️ Este pago se registrará en <strong>Cuenta Corriente</strong>, sin afectar el efectivo de caja.
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {esEfectivo && (
              <CajaSelector value={globalCajaId} onChange={setGlobalCajaId} required />
            )}
            
            {!esEfectivo && (
              <div className="space-y-2">
                <Label className="text-muted-foreground">Caja Asignada</Label>
                <div className="h-10 flex items-center px-3 rounded-md bg-blue-500/5 border border-blue-500/20 text-blue-400 text-sm font-medium">
                  Cuenta Corriente (Automático)
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label>Proveedor <span className="text-red-400">*</span></Label>
              <Select value={formData.proveedor_id} onValueChange={(val) => handleChange('proveedor_id', val)} required>
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue placeholder="Seleccione proveedor..." />
                </SelectTrigger>
                <SelectContent>
                  {proveedores.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.nombre}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>Monto <span className="text-red-400">*</span></Label>
              <Input
                type="number"
                step="1"
                min="1"
                placeholder="0"
                value={formData.monto_pagado}
                onChange={(e) => handleChange('monto_pagado', e.target.value)}
                required
                className="bg-background text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label>Fecha de Pago</Label>
              <Input
                type="date"
                value={formData.fecha_pago}
                onChange={(e) => handleChange('fecha_pago', e.target.value)}
                required
                className="glass-input font-medium [color-scheme:dark] text-foreground/80"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Turno</Label>
              <Select value={formData.turno} onValueChange={(val) => handleChange('turno', val)}>
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mañana">Mañana</SelectItem>
                  <SelectItem value="Tarde">Tarde</SelectItem>
                </SelectContent>
              </Select>
            </div>

          </div>

          <Button type="submit" className="w-full accent-button" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {loading ? 'Procesando...' : 'Registrar Pago'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default SupplierPaymentForm;
