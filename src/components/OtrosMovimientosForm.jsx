
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

const OtrosMovimientosForm = ({ onSuccess, globalCajaId, setGlobalCajaId }) => {
  const { userProfile } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState(false);
  const [categorias, setCategorias] = useState([]);

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
   * - Ingreso → suma a ingresos_efectivo
   * - Egreso  → suma a retiros_efectivo
   */
  const syncToVentaDiaria = async (monto) => {
    let campo;
    const selectedCat = categorias.find(c => c.id === formData.categoria_id);
    const catName = selectedCat?.nombre?.toLowerCase() || '';
    const isCorreccion = catName.startsWith('correccion') || catName.startsWith('corrección');
    
    if (formData.tipo === 'ingreso') {
      if (catName.startsWith('traspaso')) campo = 'traspaso_tesoreria_ingreso';
      else campo = 'ingresos_efectivo';
    } else {
      if (catName.startsWith('rrhh')) campo = 'gastos_rrhh';
      else if (catName.startsWith('servicio')) campo = 'servicios';
      else if (catName.startsWith('gasto')) campo = 'gastos';
      else if (catName.startsWith('traspaso')) campo = 'traspaso_tesoreria_egreso';
      else campo = 'otros_egresos';
    }

    // Para correcciones de boletas, no solo registramos el gasto/ingreso, 
    // sino que ajustamos el desglose de ventas (Efectivo vs Otros Medios)
    const updatePayload = {};
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
        if (formData.tipo === 'ingreso') {
          // Débito -> Efectivo (Aumenta efectivo, reduce el otro medio)
          updatePayload.venta_efectivo = (parseFloat(currentVenta.venta_efectivo) || 0) + monto;
          updatePayload[formData.medio_a_corregir] = (parseFloat(currentVenta[formData.medio_a_corregir]) || 0) - monto;
        } else {
          // Efectivo -> Débito (Reduce efectivo, aumenta el otro medio)
          updatePayload.venta_efectivo = (parseFloat(currentVenta.venta_efectivo) || 0) - monto;
          updatePayload[formData.medio_a_corregir] = (parseFloat(currentVenta[formData.medio_a_corregir]) || 0) + monto;
        }
        
        // Ejecutar actualización de los campos de venta
        const { error: updateError } = await supabase
          .from('venta_diaria')
          .update(updatePayload)
          .eq('id', currentVenta.id);
        
        if (updateError) throw updateError;
      }
      
      // NOTA: No actualizamos ingresos_efectivo / correccion_boletas para evitar doble conteo
      // en el cálculo del saldo, ya que el ajuste en venta_efectivo ya afecta al cierre_caja_sistema.
      return; 
    }

    const { data: venta, error: fetchError } = await supabase
      .from('venta_diaria')
      .select(`id, ${campo}`)
      .eq('fecha', formData.fecha)
      .eq('turno', formData.turno)
      .eq('caja_id', globalCajaId)
      .maybeSingle();

    if (fetchError) throw fetchError;

    if (venta) {
      const nuevoValor = (parseFloat(venta[campo]) || 0) + monto;
      const { error } = await supabase
        .from('venta_diaria')
        .update({ [campo]: nuevoValor })
        .eq('id', venta.id);
      if (error) throw error;
    } else {
      const baseRecord = {
        fecha: formData.fecha,
        turno: formData.turno,
        caja_id: globalCajaId,
        saldo_inicial: 0, venta_efectivo: 0, redelcom: 0, edenred: 0,
        transferencia: 0, credito: 0, total_ventas: 0,
        ingresos_efectivo: 0, retiros_efectivo: 0,
        pago_facturas_caja: 0, pago_facturas_cc: 0,
        gastos_rrhh: 0, otros_gastos: 0,
        servicios: 0, gastos: 0, correccion_boletas: 0, otros_egresos: 0,
        traspaso_tesoreria_ingreso: 0, traspaso_tesoreria_egreso: 0,
        cajero_id: userProfile?.id,
        estado: 'Abierto',
      };
      baseRecord[campo] = monto;
      const { error } = await supabase.from('venta_diaria').insert([baseRecord]);
      if (error) throw error;
      toast({ title: 'Aviso', description: `Se creó un registro de Venta Diaria para ${formData.fecha} - ${formData.turno}.` });
    }
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

      toast({
        title: 'Movimiento registrado',
        description: formData.tipo === 'ingreso'
          ? `Ingreso de $${monto.toLocaleString('es-CL')} registrado.`
          : `Egreso de $${monto.toLocaleString('es-CL')} registrado.`,
        className: formData.tipo === 'ingreso'
          ? 'bg-green-500/10 text-green-500 border-green-500/50'
          : 'bg-amber-500/10 text-amber-500 border-amber-500/50',
      });

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

          <Button type="submit" className="w-full accent-button" disabled={loading}>
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CheckCircle2 className="mr-2 h-4 w-4" />}
            {loading ? 'Guardando...' : 'Registrar Movimiento'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};

export default OtrosMovimientosForm;
