
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
      setFormData({
        id: editData.id,
        tipo: editData.tipo,
        categoria_id: editData.categoria_id || '',
        descripcion: editData.descripcion || '',
        monto: editData.monto.toString(),
        fecha: editData.fecha,
        turno: editData.turno,
        medio_a_corregir: editData.medio_a_corregir || 'redelcom',
      });
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
  const syncToVentaDiaria = async (monto) => {
    const selectedCat = categorias.find(c => c.id === formData.categoria_id);
    const catName = selectedCat?.nombre?.toLowerCase() || '';
    const isCorreccion = catName.startsWith('correccion') || catName.startsWith('corrección');
    
    // Las correcciones de boletas requieren una lógica especial de ajuste de campos 
    // que no es una simple suma de movimientos.
    if (isCorreccion) {
      const { data: currentVenta, error: fetchError } = await supabase
        .from('venta_diaria')
        .select(`id, venta_efectivo, ${formData.medio_a_corregir}`)
        .eq('fecha', formData.fecha)
        .eq('turno', formData.turno)
        .eq('caja_id', globalCajaId)
        .maybeSingle();

      if (fetchError) throw fetchError;

      if (currentVenta) {
        const updatePayload = {};
        if (formData.tipo === 'ingreso') {
          // Débito -> Efectivo (Aumenta efectivo, reduce el otro medio)
          updatePayload.venta_efectivo = (parseFloat(currentVenta.venta_efectivo) || 0) + monto;
          updatePayload[formData.medio_a_corregir] = (parseFloat(currentVenta[formData.medio_a_corregir]) || 0) - monto;
        } else {
          // Efectivo -> Débito (Reduce efectivo, aumenta el otro medio)
          updatePayload.venta_efectivo = (parseFloat(currentVenta.venta_efectivo) || 0) - monto;
          updatePayload[formData.medio_a_corregir] = (parseFloat(currentVenta[formData.medio_a_corregir]) || 0) + monto;
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
    await recalculateVentaDiaria(supabase, formData.fecha, formData.turno, globalCajaId);
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
        // Prepare update
        const updateObj = {
          fecha: formData.fecha,
          turno: formData.turno,
          caja_id: globalCajaId,
          tipo: formData.tipo,
          categoria_id: formData.categoria_id || null,
          descripcion: formData.descripcion || null,
          monto,
          medio_a_corregir: formData.medio_a_corregir || null
        };

        const { error } = await supabase.from('otros_movimientos').update(updateObj).eq('id', formData.id);
        if (error) throw error;

        // Sync with Venta Diaria
        await syncToVentaDiaria(monto);
        // If the date/box/shift changed, we should also sync the OLD one
        if (editData.fecha !== formData.fecha || editData.turno !== formData.turno || editData.caja_id !== globalCajaId) {
          await recalculateVentaDiaria(supabase, editData.fecha, editData.turno, editData.caja_id);
        }

        toast({ title: 'Movimiento actualizado', description: 'Los cambios se han guardado y sincronizado.' });
      } else {
        // Insert logic
        const { error } = await supabase.from('otros_movimientos').insert([{
          fecha: formData.fecha,
          turno: formData.turno,
          caja_id: globalCajaId,
          tipo: formData.tipo,
          categoria_id: formData.categoria_id || null,
          descripcion: formData.descripcion || null,
          monto,
        }]);
        if (error) throw error;

        await syncToVentaDiaria(monto);
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
