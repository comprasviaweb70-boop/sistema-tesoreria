
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Plus, Loader2, AlertCircle, RefreshCcw, TrendingUp, TrendingDown } from 'lucide-react';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';

const CategoriasMovimientosList = () => {
  const { toast } = useToast();
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Form nueva categoría
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formNombre, setFormNombre] = useState('');
  const [formTipo, setFormTipo] = useState('ingreso');
  const [saving, setSaving] = useState(false);

  // Confirmación de eliminación
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => { fetchCategorias(); }, []);

  const fetchCategorias = async () => {
    setLoading(true); setError(null);
    try {
      const { data, error } = await supabase
        .from('categorias_movimiento')
        .select('*')
        .order('tipo')
        .order('nombre');
      if (error) throw error;
      setCategorias(data || []);
    } catch (err) {
      setError('No se pudieron cargar las categorías.');
    } finally {
      setLoading(false);
    }
  };

  const openCreate = () => {
    setEditingId(null);
    setFormNombre('');
    setFormTipo('ingreso');
    setShowForm(true);
  };

  const openEdit = (cat) => {
    setEditingId(cat.id);
    setFormNombre(cat.nombre);
    setFormTipo(cat.tipo);
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formNombre.trim()) {
      toast({ title: 'Error', description: 'Ingrese un nombre.', variant: 'destructive' });
      return;
    }
    setSaving(true);
    try {
      if (editingId) {
        const { error } = await supabase.from('categorias_movimiento')
          .update({ nombre: formNombre.trim(), tipo: formTipo })
          .eq('id', editingId);
        if (error) throw error;
        toast({ title: 'Categoría actualizada' });
      } else {
        const { error } = await supabase.from('categorias_movimiento')
          .insert([{ nombre: formNombre.trim(), tipo: formTipo }]);
        if (error) throw error;
        toast({ title: 'Categoría creada' });
      }
      setShowForm(false);
      fetchCategorias();
    } catch (err) {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!confirmDeleteId) return;
    setIsDeleting(true);
    try {
      const { error } = await supabase.from('categorias_movimiento').delete().eq('id', confirmDeleteId);
      if (error) throw error;
      toast({ title: 'Categoría eliminada' });
      setCategorias(prev => prev.filter(c => c.id !== confirmDeleteId));
    } catch (err) {
      toast({ title: 'Error al eliminar', description: 'La categoría puede tener movimientos asociados.', variant: 'destructive' });
    } finally {
      setIsDeleting(false);
      setConfirmDeleteId(null);
    }
  };

  if (loading) return (
    <div className="flex items-center justify-center py-16 glass-card">
      <Loader2 className="h-8 w-8 animate-spin text-primary mr-3"/>
      <p className="text-muted-foreground">Cargando categorías...</p>
    </div>
  );

  if (error) return (
    <div className="flex flex-col items-center justify-center py-16 glass-card">
      <AlertCircle className="h-12 w-12 text-red-500 mb-4"/>
      <p className="text-foreground mb-4">{error}</p>
      <Button onClick={fetchCategorias} variant="outline"><RefreshCcw className="h-4 w-4 mr-2"/>Reintentar</Button>
    </div>
  );

  const recordToDelete = categorias.find(c => c.id === confirmDeleteId);

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-secondary/20 p-4 rounded-lg border border-border">
        <div>
          <h3 className="text-lg font-medium text-foreground">Categorías de Movimiento</h3>
          <p className="text-sm text-muted-foreground">Gestiona las categorías para ingresos y egresos</p>
        </div>
        <Button onClick={openCreate} className="accent-button flex items-center gap-2">
          <Plus className="h-4 w-4"/>Crear Categoría
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="border-border hover:bg-transparent">
              <TableHead className="font-semibold">Nombre</TableHead>
              <TableHead className="font-semibold">Tipo</TableHead>
              <TableHead className="font-semibold">Estado</TableHead>
              <TableHead className="text-right font-semibold">Acciones</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {categorias.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No hay categorías. Crea la primera.
                </TableCell>
              </TableRow>
            ) : categorias.map(cat => (
              <TableRow key={cat.id} className="border-border/50 hover:bg-secondary/40 transition-colors">
                <TableCell className="font-medium">{cat.nombre}</TableCell>
                <TableCell>
                  <span className={`inline-flex items-center gap-1.5 text-xs font-semibold px-2 py-0.5 rounded border ${
                    cat.tipo === 'ingreso'
                      ? 'bg-green-500/10 text-green-400 border-green-500/30'
                      : 'bg-red-500/10 text-red-400 border-red-500/30'
                  }`}>
                    {cat.tipo === 'ingreso' ? <><TrendingUp className="h-3 w-3"/>Ingreso</> : <><TrendingDown className="h-3 w-3"/>Egreso</>}
                  </span>
                </TableCell>
                <TableCell>
                  {cat.activo
                    ? <Badge className="bg-green-500/10 text-green-500 border-green-500/20">Activa</Badge>
                    : <Badge variant="outline" className="text-muted-foreground">Inactiva</Badge>}
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" size="icon" onClick={() => openEdit(cat)} title="Editar">
                      <Edit className="h-4 w-4 text-blue-400"/>
                    </Button>
                    <Button variant="ghost" size="icon" onClick={() => setConfirmDeleteId(cat.id)} title="Eliminar">
                      <Trash2 className="h-4 w-4 text-red-400"/>
                    </Button>
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* Dialog crear/editar */}
      <Dialog open={showForm} onOpenChange={(open) => !open && setShowForm(false)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Categoría' : 'Nueva Categoría'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Nombre</Label>
              <Input
                value={formNombre}
                onChange={e => setFormNombre(e.target.value)}
                placeholder="Ej: Pago RRHH, Aporte de caja..."
                className="bg-background"
                autoFocus
              />
            </div>
            <div className="space-y-2">
              <Label>Tipo</Label>
              <Select value={formTipo} onValueChange={setFormTipo}>
                <SelectTrigger className="bg-background"><SelectValue/></SelectTrigger>
                <SelectContent>
                  <SelectItem value="ingreso">Ingreso</SelectItem>
                  <SelectItem value="egreso">Egreso</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setShowForm(false)} disabled={saving}>Cancelar</Button>
            <Button onClick={handleSave} disabled={saving} className="accent-button">
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin"/> : null}
              {editingId ? 'Guardar Cambios' : 'Crear'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Dialog confirmación eliminación */}
      <Dialog open={!!confirmDeleteId} onOpenChange={(open) => !open && setConfirmDeleteId(null)}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>¿Eliminar categoría?</DialogTitle>
            <DialogDescription>
              Se eliminará la categoría <strong>"{recordToDelete?.nombre}"</strong>. Fallará si tiene movimientos asociados.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmDeleteId(null)} disabled={isDeleting}>Cancelar</Button>
            <Button onClick={handleDelete} disabled={isDeleting} className="bg-red-500 hover:bg-red-600 text-white">
              {isDeleting ? 'Eliminando...' : 'Sí, eliminar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default CategoriasMovimientosList;
