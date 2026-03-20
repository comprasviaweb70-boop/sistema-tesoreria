
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Package, Plus, Pencil, Trash2, CheckCircle2, XCircle, AlertCircle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';

const AdminCajasPage = () => {
  const [cajas, setCajas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isEditDialogOpen, setIsEditDialogOpen] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const { toast } = useToast();

  const [formData, setFormData] = useState({
    id: '',
    numero_caja: '',
    nombre: '',
    activo: true
  });

  useEffect(() => {
    fetchCajas();
  }, []);

  const fetchCajas = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('cajas')
        .select('*')
        .order('numero_caja', { ascending: true });

      if (error) throw error;
      setCajas(data || []);
    } catch (error) {
      console.error('Error fetching cajas:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar las cajas",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleOpenAddDialog = () => {
    setFormData({ id: '', numero_caja: '', nombre: '', activo: true });
    setIsAddDialogOpen(true);
  };

  const handleOpenEditDialog = (caja) => {
    setFormData({ ...caja });
    setIsEditDialogOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setActionLoading(true);
    try {
      if (formData.id) {
        // Update
        const { error } = await supabase
          .from('cajas')
          .update({
            numero_caja: parseInt(formData.numero_caja),
            nombre: formData.nombre,
            activo: formData.activo
          })
          .eq('id', formData.id);
        
        if (error) throw error;
        toast({ title: "Éxito", description: "Caja actualizada correctamente" });
      } else {
        // Create - Auto-calculate next number if name only
        const { data: lastCaja } = await supabase
          .from('cajas')
          .select('numero_caja')
          .order('numero_caja', { ascending: false })
          .limit(1)
          .maybeSingle();
        
        const nextNum = (lastCaja?.numero_caja || 0) + 1;

        const { error } = await supabase
          .from('cajas')
          .insert([{
            numero_caja: nextNum,
            nombre: formData.nombre,
            activo: true
          }]);
        
        if (error) throw error;
        toast({ title: "Éxito", description: "Caja creada correctamente" });
      }
      setIsAddDialogOpen(false);
      setIsEditDialogOpen(false);
      fetchCajas();
    } catch (error) {
      console.error('Error saving caja:', error);
      toast({
        title: "Error",
        description: "No se pudo guardar la información",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  const handleDelete = async (id) => {
    if (!window.confirm("¿Está seguro que desea eliminar esta caja? Esta acción no se puede deshacer y puede fallar si la caja tiene registros asociados (como ventas diarias).")) {
      return;
    }

    setActionLoading(true);
    try {
      const { error } = await supabase
        .from('cajas')
        .delete()
        .eq('id', id);

      if (error) {
        if (error.code === '23503') {
          throw new Error("No se puede eliminar la caja porque tiene registros asociados. Intenta desactivarla en su lugar.");
        }
        throw error;
      }

      toast({ title: "Éxito", description: "Caja eliminada correctamente" });
      fetchCajas();
    } catch (error) {
      console.error('Error deleting caja:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo eliminar la caja",
        variant: "destructive",
      });
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <Helmet>
        <title>Gestión de Cajas - Iciz Market</title>
      </Helmet>

      <div className="gradient-bg min-h-screen">
        <Header />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <Package className="h-6 w-6 accent-text" />
                Gestión de Cajas
              </h2>
              <p className="text-muted-foreground mt-1">
                Administra los puntos de venta (cajas) del sistema
              </p>
            </div>
            
            <Button onClick={handleOpenAddDialog} className="accent-button">
              <Plus className="mr-2 h-4 w-4" />
              Nueva Caja
            </Button>
          </div>

          <div className="glass-card overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 accent-border border-t-transparent"></div>
                <p className="mt-4 text-muted-foreground">Cargando cajas...</p>
              </div>
            ) : cajas.length > 0 ? (
              <div className="overflow-x-auto glass-table-container">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-semibold">Nombre Descriptivo</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-center">Estado</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {cajas.map((caja) => (
                      <TableRow key={caja.id} className="bg-secondary/20 hover:bg-secondary/40 transition-colors">
                        <TableCell className="text-foreground font-medium">
                          {caja.nombre}
                        </TableCell>
                        <TableCell className="text-center">
                          <button 
                            onClick={() => toggleStatus(caja)}
                            className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-all ${
                              caja.activo 
                                ? 'bg-green-500/10 text-green-400 border-green-500/30' 
                                : 'bg-red-500/10 text-red-500 border-red-500/30'
                            }`}
                          >
                            {caja.activo ? <CheckCircle2 className="h-3 w-3" /> : <XCircle className="h-3 w-3" />}
                            {caja.activo ? 'Activa' : 'Inactiva'}
                          </button>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleOpenEditDialog(caja)}
                              className="h-8 w-8 p-0 text-amber-400 hover:text-amber-500 hover:bg-amber-500/10"
                            >
                              <Pencil className="h-4 w-4" />
                            </Button>
                            <Button 
                              variant="ghost" 
                              size="sm" 
                              onClick={() => handleDelete(caja.id)}
                              className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-500/10"
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-secondary/30 mb-4">
                  <Package className="h-8 w-8 text-muted-foreground/50" />
                </div>
                <h3 className="text-lg font-semibold text-foreground mb-2">No hay cajas registradas</h3>
                <p className="text-muted-foreground max-w-sm mx-auto mb-6">
                  Parece que aún no has dado de alta ninguna caja en el sistema.
                </p>
                <Button onClick={handleOpenAddDialog} variant="outline" className="border-primary text-primary hover:bg-primary/10">
                  <Plus className="mr-2 h-4 w-4" />
                  Crear mi primera caja
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dialogo Agregar/Editar */}
      <Dialog open={isAddDialogOpen || isEditDialogOpen} onOpenChange={(val) => {
        if (!val) {
          setIsAddDialogOpen(false);
          setIsEditDialogOpen(false);
        }
      }}>
        <DialogContent className="glass-card border-border border shadow-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Package className="h-5 w-5 accent-text" />
              {formData.id ? 'Editar Caja' : 'Nueva Caja'}
            </DialogTitle>
            <DialogDescription>
              Completa la información básica de la caja.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 py-4">
            <div className="grid grid-cols-4 items-center gap-4">
              <Label htmlFor="nombre" className="text-right">Nombre</Label>
              <Input
                id="nombre"
                placeholder="Ej: Caja Principal o Nombre del Cajero"
                className="col-span-3 glass-input"
                value={formData.nombre}
                onChange={(e) => setFormData({...formData, nombre: e.target.value})}
                required
              />
            </div>
            
            {!formData.id && (
              <div className="flex items-start gap-2 bg-primary/10 p-3 rounded-lg border border-primary/20 mt-4">
                <AlertCircle className="h-4 w-4 text-primary mt-0.5" />
                <p className="text-xs text-muted-foreground">
                  Al crear una caja, se habilitará automáticamente para su uso en los reportes diarios.
                </p>
              </div>
            )}

            <DialogFooter className="pt-6">
              <Button 
                type="button" 
                variant="ghost" 
                onClick={() => { setIsAddDialogOpen(false); setIsEditDialogOpen(false); }}
                disabled={actionLoading}
              >
                Cancelar
              </Button>
              <Button type="submit" className="accent-button" disabled={actionLoading}>
                {actionLoading ? 'Guardando...' : 'Guardar Cambios'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
};

export default AdminCajasPage;
