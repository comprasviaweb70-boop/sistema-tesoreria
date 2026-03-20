
import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/customSupabaseClient';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Edit, Trash2, Plus, Loader2, AlertCircle, RefreshCcw } from 'lucide-react';
import ProveedorForm from './ProveedorForm';
import EditProveedorForm from './EditProveedorForm';

const ProveedoresList = ({ onSuccess }) => {
  const { toast } = useToast();
  const [proveedores, setProveedores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProveedor, setEditingProveedor] = useState(null);

  const fetchProveedores = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from('proveedores')
        .select('*')
        .order('nombre');

      if (error) throw error;
      setProveedores(data || []);
    } catch (err) {
      console.error('Error fetching proveedores:', err);
      setError('No se pudieron cargar los proveedores. Por favor, intente nuevamente.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProveedores();
  }, []);

  const handleSuccess = () => {
    fetchProveedores();
    if (onSuccess) onSuccess();
  };

  const handleDelete = async (id, nombre) => {
    if (!window.confirm(`¿Está seguro que desea eliminar al proveedor "${nombre}"? Esta acción no se puede deshacer y fallará si tiene registros asociados.`)) {
      return;
    }

    try {
      const { error } = await supabase
        .from('proveedores')
        .delete()
        .eq('id', id);

      if (error) throw error;

      toast({ title: 'Proveedor eliminado', description: 'El proveedor ha sido eliminado correctamente.' });
      handleSuccess();
    } catch (err) {
      console.error('Error deleting proveedor:', err);
      toast({ 
        title: 'Error al eliminar', 
        description: 'No se pudo eliminar el proveedor. Es posible que tenga facturas o pagos asociados.', 
        variant: 'destructive' 
      });
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-16 glass-card">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Cargando proveedores...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-16 glass-card border-red-500/30">
        <AlertCircle className="h-12 w-12 text-red-500 mb-4" />
        <p className="text-foreground mb-4">{error}</p>
        <Button onClick={fetchProveedores} variant="outline" className="flex items-center gap-2">
          <RefreshCcw className="h-4 w-4" /> Reintentar
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center bg-secondary/20 p-4 rounded-lg border border-border">
        <div>
          <h3 className="text-lg font-medium text-foreground">Directorio de Proveedores</h3>
          <p className="text-sm text-muted-foreground">Gestione el listado maestro de proveedores del sistema</p>
        </div>
        <Button onClick={() => setIsCreateOpen(true)} className="accent-button flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Crear Proveedor
        </Button>
      </div>

      <div className="glass-card overflow-hidden">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="border-border hover:bg-transparent">
                <TableHead className="font-semibold text-foreground">Nombre</TableHead>
                <TableHead className="font-semibold text-foreground">RUT</TableHead>
                <TableHead className="font-semibold text-foreground">Teléfono</TableHead>
                <TableHead className="font-semibold text-foreground">Email</TableHead>
                <TableHead className="font-semibold text-foreground">Estado</TableHead>
                <TableHead className="text-right font-semibold text-foreground">Acciones</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {proveedores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    No hay proveedores registrados.
                  </TableCell>
                </TableRow>
              ) : (
                proveedores.map((prov) => (
                  <TableRow key={prov.id} className="border-border/50 hover:bg-secondary/40 transition-colors">
                    <TableCell className="font-medium">{prov.nombre}</TableCell>
                    <TableCell>{prov.rut || <span className="text-muted-foreground text-sm italic">Sin RUT</span>}</TableCell>
                    <TableCell>{prov.telefono || <span className="text-muted-foreground text-sm italic">N/A</span>}</TableCell>
                    <TableCell>{prov.email || <span className="text-muted-foreground text-sm italic">N/A</span>}</TableCell>
                    <TableCell>
                      {prov.activo ? (
                        <Badge variant="default" className="bg-green-500/10 text-green-500 hover:bg-green-500/20 border-green-500/20">Activo</Badge>
                      ) : (
                        <Badge variant="outline" className="text-muted-foreground">Inactivo</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => setEditingProveedor(prov)}
                          title="Editar"
                        >
                          <Edit className="h-4 w-4 text-blue-400" />
                        </Button>
                        <Button 
                          variant="ghost" 
                          size="icon" 
                          onClick={() => handleDelete(prov.id, prov.nombre)}
                          title="Eliminar"
                        >
                          <Trash2 className="h-4 w-4 text-red-400" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <ProveedorForm 
        isOpen={isCreateOpen} 
        onClose={() => setIsCreateOpen(false)} 
        onSuccess={handleSuccess} 
      />

      <EditProveedorForm 
        isOpen={!!editingProveedor} 
        onClose={() => setEditingProveedor(null)} 
        proveedor={editingProveedor} 
        onSuccess={handleSuccess} 
      />
    </div>
  );
};

export default ProveedoresList;
