
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, CheckCircle2, TrendingUp, TrendingDown } from 'lucide-react';
import CajaSelector from '@/components/CajaSelector';
import { useAuth } from '@/contexts/AuthContextObject';
import { recalculateVentaDiaria } from '@/utils/ventaDiariaSync';

const OtrosMovimientosForm = ({ onSuccess, globalCajaId, setGlobalCajaId, editData = null, onCancel = null }) => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState([]);

  const [originalData, setOriginalData] = useState(null);

  const isEdit = !!editData?.id;

  const [formData, setFormData] = useState({
    tipo: 'ingreso',
    categoria_id: '',
    descripcion: '',
    monto: '',
    fecha: new Date().toISOString().split('T')[0],
    turno: localStorage.getItem('vd_turno') || 'Mañana',
    medio_a_corregir: 'redelcom', // Default: Débito
  });

  useEffect(() => {
    if (editData) {
      const medio = inferMedio(editData);
      const data = {
        id: editData.id,
        tipo: editData.tipo,
        categoria_id: editData.categoria_id || '',
        descripcion: editData.descripcion || '',
        monto: editData.monto.toString(),
        fecha: editData.fecha,
        turno: editData.turno,
        medio_a_corregir: medio,
      };
      setFormData(data);
      setOriginalData(data); // Store for reversal
      if (editData.caja_id) setGlobalCajaId(editData.caja_id);
    }
  }, [editData]);

  useEffect(() => {
    fetchCategorias(formData.tipo);
  }, [formData.tipo]);

  const fetchCategorias = async (tipo) => {
    const { data } = await supabase
      .from('categorias_movimiento')
      .select('id, nombre')
      .eq('tipo', tipo)
      .eq('activo', true)
      .order('nombre');
    setCategorias(data || []);
  };

  const inferMedio = (record) => {
    if (record.medio_a_corregir) return record.medio_a_corregir;
    if (record.descripcion?.includes('[Medio:')) {
      const match = record.descripcion.match(/\[Medio: (.*?)\]/);
      if (match) return match[1];
    }
    const catName = record.categorias_movimiento?.nombre?.toLowerCase() || '';
    if (catName.includes('debito') || catName.includes('débito') || catName.includes('redelcom')) return 'redelcom';
    if (catName.includes('transferencia')) return 'transferencia';
    if (catName.includes('tarjeta_credito') || catName.includes('crédito')) return 'tarjeta_credito';
    if (catName.includes('edenred')) return 'edenred';
    if (catName.includes('credito') || catName.includes('fiado')) return 'credito';
    return 'redelcom';
  };

  const handleChange = (field, value) => {
    setFormData(prev => {
      const next = { ...prev, [field]: value };
      if (field === 'tipo') next.categoria_id = '';
      return next;
    });
  };

  /**
   * Sincroniza el movimiento con venta_diaria:
   */
  const syncToVentaDiaria = async (monto, currentFormData, isReversal = false) => {
    const selectedCat = categorias.find(c => c.id === currentFormData.categoria_id);
    const catName = selectedCat?.nombre?.toLowerCase() || '';
    const isCorreccion = catName.startsWith('correccion') || catName.startsWith('corrección') || catName.includes('ajuste boletas');
    
    if (isCorreccion) {
      const { data: currentVenta, error: fetchError } = await supabase
        .from('venta_diaria')
        .select(`id, venta_efectivo, ${currentFormData.medio_a_corregir}`)
        .eq('fecha', currentFormData.fecha)
        .eq('turno', currentFormData.turno)
        .eq('caja_id', globalCajaId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (currentVenta) {
        const updatePayload = {};
        const sign = isReversal ? -1 : 1;
        const adjustedMonto = monto * sign;

        if (currentFormData.tipo === 'ingreso') {
          // Débito -> Efectivo (Original: Aumenta efectivo, reduce el otro medio)
          updatePayload.venta_efectivo = (parseFloat(currentVenta.venta_efectivo) || 0) + adjustedMonto;
          updatePayload[currentFormData.medio_a_corregir] = (parseFloat(currentVenta[currentFormData.medio_a_corregir]) || 0) - adjustedMonto;
        } else {
          // Efectivo -> Débito (Original: Reduce efectivo, aumenta el otro medio)
          updatePayload.venta_efectivo = (parseFloat(currentVenta.venta_efectivo) || 0) - adjustedMonto;
          updatePayload[currentFormData.medio_a_corregir] = (parseFloat(currentVenta[currentFormData.medio_a_corregir]) || 0) + adjustedMonto;
        }
        
        const { error: updateError } = await supabase
          .from('venta_diaria')
          .update(updatePayload)
          .eq('id', currentVenta.id);
        
        if (updateError) throw updateError;
      }
      return; 
    }

    // Para todos los demás movimientos, usamos la utilidad de recalculo robusto
    await recalculateVentaDiaria(supabase, currentFormData.fecha, currentFormData.turno, globalCajaId);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!globalCajaId || globalCajaId === 'all') {
      toast({ title: 'Error', description: 'Seleccione una caja específica.', variant: 'destructive' });
      return;
    }
    const monto = parseFloat(formData.monto);
    if (!monto || monto <= 0) {
      toast({ title: 'Error', description: 'Ingrese un monto válido.', variant: 'destructive' });
      return;
    }

    setLoading(true);
    try {
      if (isEdit) {
        // 1. REVERSE old adjustment if it was a correction
        if (originalData) {
          await syncToVentaDiaria(parseFloat(originalData.monto), originalData, true);
        }

        // 2. Prepare update
        const selectedCat = categorias.find(c => c.id === formData.categoria_id);
        const isCorreccion = selectedCat?.nombre?.toLowerCase()?.includes('corrección') || selectedCat?.nombre?.toLowerCase()?.includes('correccion') || selectedCat?.nombre?.toLowerCase()?.includes('ajuste boletas');
        
        let finalDescripcion = formData.descripcion;
        if (isCorreccion) {
          // Add tag to description to persist medio_a_corregir
          if (!finalDescripcion?.includes(`[Medio: ${formData.medio_a_corregir}]`)) {
            finalDescripcion = `[Medio: ${formData.medio_a_corregir}] ${finalDescripcion || ''}`.trim();
          }
        }

        const updateObj = {
          fecha: formData.fecha,
          turno: formData.turno,
          caja_id: globalCajaId,
          tipo: formData.tipo,
          categoria_id: formData.categoria_id || null,
          descripcion: finalDescripcion || null,
          monto,
        };

        const { error } = await supabase.from('otros_movimientos').update(updateObj).eq('id', formData.id);
        if (error) throw error;

        // 3. APPLY new adjustment
        await syncToVentaDiaria(monto, { ...formData, descripcion: finalDescripcion });
        
        // 4. If the metadata changed, we should also sync the OLD one (already reversed above)
        if (editData.fecha !== formData.fecha || editData.turno !== formData.turno || editData.caja_id !== globalCajaId) {
          await recalculateVentaDiaria(supabase, editData.fecha, editData.turno, editData.caja_id);
        }

        toast({ title: 'Movimiento actualizado', description: 'Los cambios se han guardado y sincronizado.' });
      } else {
        // Insert logic
        const selectedCat = categorias.find(c => c.id === formData.categoria_id);
        const isCorreccion = selectedCat?.nombre?.toLowerCase()?.includes('corrección') || selectedCat?.nombre?.toLowerCase()?.includes('correccion') || selectedCat?.nombre?.toLowerCase()?.includes('ajuste boletas');
        
        let finalDescripcion = formData.descripcion;
        if (isCorreccion) {
          finalDescripcion = `[Medio: ${formData.medio_a_corregir}] ${finalDescripcion || ''}`.trim();
        }

        const { error } = await supabase.from('otros_movimientos').insert([{
          fecha: formData.fecha,
          turno: formData.turno,
          caja_id: globalCajaId,
          tipo: formData.tipo,
          categoria_id: formData.categoria_id || null,
          descripcion: finalDescripcion || null,
          monto,
        }]);
        if (error) throw error;

        await syncToVentaDiaria(monto, { ...formData, descripcion: finalDescripcion });
        toast({ title: 'Movimiento registrado', description: 'El nuevo registro ha sido sincronizado.' });
      }

      setFormData(prev => ({ ...prev, categoria_id: '', descripcion: '', monto: '' }));
      if (onSuccess) onSuccess();
    } catch (err) {
      console.error(err);
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const esIngreso = formData.tipo === 'ingreso';

  return (
    <Card className="glass-card">
      <CardHeader>
        <CardTitle>Registrar Movimiento</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-5">

          {/* Toggle Ingreso / Egreso */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => handleChange('tipo', 'ingreso')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all font-medium text-sm ${
                esIngreso
                  ? 'border-green-500 bg-green-500/10 text-green-400'
                  : 'border-border bg-background text-muted-foreground hover:border-green-500/50'
              }`}
            >
              <TrendingUp className="h-5 w-5" />
              Ingreso
            </button>
            <button
              type="button"
              onClick={() => handleChange('tipo', 'egreso')}
              className={`flex items-center justify-center gap-2 p-3 rounded-lg border-2 transition-all font-medium text-sm ${
                !esIngreso
                  ? 'border-red-500 bg-red-500/10 text-red-400'
                  : 'border-border bg-background text-muted-foreground hover:border-red-500/50'
              }`}
            >
              <TrendingDown className="h-5 w-5" />
              Egreso
            </button>
          </div>

          <div className={`text-xs rounded-md px-3 py-2 border ${
            esIngreso
              ? 'text-green-400 bg-green-500/10 border-green-500/30'
              : 'text-red-400 bg-red-500/10 border-red-500/30'
          }`}>
            {esIngreso
              ? '↑ Este ingreso aumentará el efectivo de caja.'
              : '↓ Este egreso reducirá el efectivo de caja.'}
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <CajaSelector value={globalCajaId} onChange={setGlobalCajaId} required />

            <div className="space-y-2">
              <Label>Categoría</Label>
              <Select value={formData.categoria_id} onValueChange={(v) => handleChange('categoria_id', v)}>
                <SelectTrigger className="bg-background text-foreground">
                  <SelectValue placeholder="Seleccione categoría..." />
                </SelectTrigger>
                <SelectContent>
                  {categorias.length === 0
                    ? <SelectItem value="sin-cat" disabled>Sin categorías — créalas en la pestaña Categorías</SelectItem>
                    : categorias.map(c => <SelectItem key={c.id} value={c.id}>{c.nombre}</SelectItem>)
                  }
                </SelectContent>
              </Select>
            </div>

            {/* Campo condicional para corrección de boletas */}
            {formData.categoria_id && (categorias.find(c => c.id === formData.categoria_id)?.nombre?.toLowerCase()?.startsWith('correccion') || 
             categorias.find(c => c.id === formData.categoria_id)?.nombre?.toLowerCase()?.startsWith('corrección')) && (
              <div className="space-y-2 md:col-span-2 p-3 bg-primary/5 border border-primary/20 rounded-md">
                <Label className="text-primary font-semibold">Medio de Pago a Corregir</Label>
                <p className="text-[10px] text-muted-foreground mb-2">
                  Selecciona qué medio de pago se verá afectado por esta corrección de efectivo.
                </p>
                <Select value={formData.medio_a_corregir} onValueChange={(v) => handleChange('medio_a_corregir', v)}>
                  <SelectTrigger className="bg-background text-foreground">
                    <SelectValue placeholder="Seleccione medio..." />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="redelcom">Débito (Redelcom)</SelectItem>
                    <SelectItem value="tarjeta_credito">Tarjeta Crédito</SelectItem>
                    <SelectItem value="transferencia">Transferencia</SelectItem>
                    <SelectItem value="edenred">Edenred</SelectItem>
                    <SelectItem value="credito">Crédito Local (Fiado)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="space-y-2 md:col-span-2">
              <Label>Descripción / Detalle</Label>
              <Input
                type="text"
                placeholder="Ej: Aporte de efectivo para cambio, pago sueldo mes de marzo..."
                value={formData.descripcion}
                onChange={(e) => handleChange('descripcion', e.target.value)}
                className="bg-background text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label>Monto <span className="text-red-400">*</span></Label>
              <Input
                type="number" step="1" min="1" placeholder="0"
                value={formData.monto}
                onChange={(e) => handleChange('monto', e.target.value)}
                required className="bg-background text-foreground"
              />
            </div>

            <div className="space-y-2">
              <Label>Fecha</Label>
              <Input
                type="date" value={formData.fecha}
                onChange={(e) => handleChange('fecha', e.target.value)}
                required className="glass-input font-medium [color-scheme:dark] text-foreground/80"
              />
            </div>

            <div className="space-y-2 md:col-span-2">
              <Label>Turno</Label>
              <Select value={formData.turno} onValueChange={(v) => handleChange('turno', v)}>
                <SelectTrigger className="bg-background text-foreground"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mañana">Mañana</SelectItem>
                  <SelectItem value="Tarde">Tarde</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex gap-3">
            {onCancel && (
              <Button type="button" variant="outline" className="flex-1" onClick={onCancel} disabled={loading}>
                Cancelar
              </Button>
            )}
            <Button type="submit" className="flex-[2] accent-button" disabled={loading}>
              {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
              {loading ? 'Guardando...' : (isEdit ? 'Guardar Cambios' : 'Registrar Movimiento')}
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default OtrosMovimientosForm;
