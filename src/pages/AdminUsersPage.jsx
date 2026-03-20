
import React, { useState, useEffect } from 'react';
import { Helmet } from 'react-helmet';
import { Users, Mail, Calendar, Shield, Trash2, Plus, UserPlus, Lock, User as UserIcon, Package } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { supabase } from '@/lib/customSupabaseClient';
import { useAuth } from '@/contexts/AuthContextObject';
import { useToast } from '@/hooks/use-toast';
import Header from '@/components/Header';
import AdminRoleManagement from '@/components/AdminRoleManagement';

const AdminUsersPage = () => {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isActionLoading, setIsActionLoading] = useState(false);
  const { toast } = useToast();
  const { signUp, userProfile } = useAuth();

  const [newUser, setNewUser] = useState({
    nombre_completo: '',
    email: '',
    password: '',
  });

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .order('fecha_creacion', { ascending: false });

      if (error) throw error;
      setUsers(data || []);
    } catch (error) {
      console.error('Error fetching users:', error);
      toast({
        title: "Error",
        description: "No se pudieron cargar los usuarios",
        variant: "destructive",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteUser = async (userToDelete) => {
    if (userToDelete.id === userProfile?.id) {
      toast({ title: "Error", description: "No puedes eliminar tu propio usuario.", variant: "destructive" });
      return;
    }

    if (!window.confirm(`¿Estás seguro de que deseas eliminar al usuario ${userToDelete.nombre}? Esta acción es permanente.`)) {
      return;
    }

    setIsActionLoading(true);
    try {
      // Nota: Eliminar un usuario de la tabla 'usuarios' no lo elimina de Supabase Auth
      // Para eliminar de Auth se suele requerir una Edge Function o usar service_role key.
      // Sin embargo, podemos intentar eliminarlo de la tabla pública para restringir acceso en la app si las políticas RLS se basan en ella.
      const { error } = await supabase
        .from('usuarios')
        .delete()
        .eq('id', userToDelete.id);

      if (error) throw error;

      toast({ title: "Usuario eliminado", description: "El usuario ha sido removido de la base de datos pública." });
      setUsers(users.filter(u => u.id !== userToDelete.id));
    } catch (error) {
      console.error('Error deleting user:', error);
      toast({
        title: "Error",
        description: "No se pudo eliminar el usuario.",
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleCreateCaja = async (userRecord) => {
    setIsActionLoading(true);
    try {
      // 1. Obtener el próximo número de caja (oculto para el usuario, pero necesario para el orden interno)
      const { data: lastCaja, error: fetchError } = await supabase
        .from('cajas')
        .select('numero_caja')
        .order('numero_caja', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (fetchError) throw fetchError;
      
      const nextNum = (lastCaja?.numero_caja || 0) + 1;
      const nombreCaja = userRecord.nombre || userRecord.nombre_completo;

      // 2. Insertar en la tabla cajas
      const { error: insertError } = await supabase
        .from('cajas')
        .insert({
          nombre: nombreCaja,
          numero_caja: nextNum,
          activo: true
        });

      if (insertError) {
        if (insertError.code === '23505') {
          throw new Error(`Ya existe una caja con ese número o nombre.`);
        }
        throw insertError;
      }

      toast({
        title: "Caja Vinculada",
        description: `Se ha creado la caja "${nombreCaja}" exitosamente. Ya aparecerá en los selectores.`,
      });
    } catch (error) {
      console.error('Error creating linked caja:', error);
      toast({
        title: "Error",
        description: error.message || "No se pudo vincular como caja.",
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleAddUser = async (e) => {
    e.preventDefault();
    setIsActionLoading(true);
    try {
      const { data, error } = await signUp(newUser.email, newUser.password, newUser.nombre_completo);
      
      if (error) throw error;

      toast({
        title: "Usuario Creado",
        description: `Se ha registrado a ${newUser.nombre_completo} exitosamente.`,
      });
      
      setIsAddDialogOpen(false);
      setNewUser({ nombre_completo: '', email: '', password: '' });
      fetchUsers();
    } catch (error) {
      console.error('Error adding user:', error);
      toast({
        title: "Error al crear usuario",
        description: error.message || "No se pudo crear el usuario.",
        variant: "destructive",
      });
    } finally {
      setIsActionLoading(false);
    }
  };

  const handleRoleUpdated = (userId, newRole) => {
    setUsers(users.map(u => 
      u.id === userId ? { ...u, rol: newRole } : u
    ));
  };

  const formatDate = (dateString) => {
    if (!dateString) return 'Desconocida';
    return new Date(dateString).toLocaleDateString('es-CL', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  return (
    <>
      <Helmet>
        <title>Administración de Usuarios - Iciz Market</title>
        <meta name="description" content="Gestión de roles y usuarios de Iciz Market" />
      </Helmet>

      <div className="gradient-bg min-h-screen">
        <Header />

        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
          <div className="mb-6 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
                <Users className="h-6 w-6 accent-text" />
                Gestión de Cajeros / Usuarios
              </h2>
              <p className="text-muted-foreground mt-1">
                Administra los roles, accesos y personal del sistema
              </p>
            </div>
            
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button className="accent-button">
                  <UserPlus className="mr-2 h-4 w-4" />
                  Nuevo Cajero
                </Button>
              </DialogTrigger>
              <DialogContent className="glass-card sm:max-w-md border border-border/50">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    <UserPlus className="h-5 w-5 accent-text" />
                    Registrar Nuevo Usuario
                  </DialogTitle>
                  <DialogDescription>
                    Crea una nueva cuenta para un cajero o supervisor.
                  </DialogDescription>
                </DialogHeader>
                <form onSubmit={handleAddUser} className="space-y-4 py-4">
                  <div className="space-y-2">
                    <Label htmlFor="nombre_completo">Nombre Completo</Label>
                    <div className="relative">
                      <UserIcon className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="nombre_completo"
                        placeholder="Ej: Juan Pérez"
                        className="pl-10 glass-input"
                        value={newUser.nombre_completo}
                        onChange={(e) => setNewUser({...newUser, nombre_completo: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Correo Electrónico</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        placeholder="juan@iclmarket.local"
                        className="pl-10 glass-input"
                        value={newUser.email}
                        onChange={(e) => setNewUser({...newUser, email: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="password">Contraseña Provisional</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="password"
                        type="password"
                        placeholder="••••••••"
                        className="pl-10 glass-input"
                        value={newUser.password}
                        onChange={(e) => setNewUser({...newUser, password: e.target.value})}
                        required
                      />
                    </div>
                  </div>
                  <DialogFooter className="pt-4">
                    <Button variant="ghost" type="button" onClick={() => setIsAddDialogOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="submit" className="accent-button" disabled={isActionLoading}>
                      {isActionLoading ? 'Creando...' : 'Crear Usuario'}
                    </Button>
                  </DialogFooter>
                </form>
              </DialogContent>
            </Dialog>
          </div>

          <div className="glass-card overflow-hidden">
            {loading ? (
              <div className="text-center py-12">
                <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 accent-border border-t-transparent"></div>
                <p className="mt-4 text-muted-foreground">Cargando usuarios...</p>
              </div>
            ) : users.length > 0 ? (
              <div className="overflow-x-auto glass-table-container">
                <Table>
                  <TableHeader>
                    <TableRow className="border-border hover:bg-transparent">
                      <TableHead className="text-muted-foreground font-semibold">Nombre</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Correo Electrónico</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Fecha de Creación</TableHead>
                      <TableHead className="text-muted-foreground font-semibold">Rol / Acción</TableHead>
                      <TableHead className="text-muted-foreground font-semibold text-right">Acciones</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id} className="bg-secondary/20 hover:bg-secondary/40 transition-colors">
                        <TableCell className="font-medium text-foreground">
                          {user.nombre || user.nombre_completo}
                          {user.rol === 'admin' && (
                            <span className="ml-2 inline-flex items-center rounded-full bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary ring-1 ring-inset ring-primary/30">
                              Admin
                            </span>
                          )}
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Mail className="h-3 w-3" />
                            {user.email || 'Sin correo'}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-muted-foreground">
                            <Calendar className="h-3 w-3" />
                            {formatDate(user.fecha_creacion || user.created_at)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <AdminRoleManagement 
                            user={user} 
                            onUpdate={handleRoleUpdated} 
                          />
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              title="Vincular como Caja"
                              onClick={() => handleCreateCaja(user)}
                              disabled={isActionLoading}
                              className="text-primary hover:text-primary/80 hover:bg-primary/10 h-8 w-8 p-0"
                            >
                              <Package className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleDeleteUser(user)}
                              disabled={isActionLoading || user.id === userProfile?.id}
                              className="text-red-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
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
              <div className="text-center py-12 text-muted-foreground">
                No se encontraron usuarios registrados.
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
};

export default AdminUsersPage;
