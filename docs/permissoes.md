# Matriz de permissões

Gerado por `npm run docs:permissoes` a partir de `src/config/permissions.js` (fonte única).
A API aplica a matriz em todas as rotas protegidas; `GET /api/v1/me` devolve as permissões
do usuário logado e `GET /api/v1/permissions` devolve a matriz completa (somente administrador).

| Módulo | Ação | Administrador (Super Admin) | Gestor da ONG | Gestor de animais (Veterinário/Cuidador) | Financeiro (Atendimento e Doações) | Voluntariado (Voluntário) |
| --- | --- | :---: | :---: | :---: | :---: | :---: |
| Visão geral (`dashboard`) | ver (`read`) | sim | sim | sim | sim | sim |
| Animais (`animals`) | ver (`read`) | sim | sim | sim | — | sim |
| Animais (`animals`) | criar (`create`) | sim | sim | sim | — | — |
| Animais (`animals`) | editar (`update`) | sim | sim | sim | — | — |
| Animais (`animals`) | excluir (`delete`) | sim | sim | — | — | — |
| Animais (`animals`) | exportar (`export`) | sim | sim | sim | — | — |
| Pedidos de adoção (`adoptions`) | ver (`read`) | sim | sim | sim | sim | — |
| Pedidos de adoção (`adoptions`) | editar (`update`) | sim | sim | sim | sim | — |
| Pedidos de adoção (`adoptions`) | aprovar (`approve`) | sim | sim | sim | — | — |
| Adotantes (`adopters`) | ver (`read`) | sim | sim | sim | sim | — |
| Adotantes (`adopters`) | editar (`update`) | sim | sim | — | sim | — |
| Adotantes (`adopters`) | revelar dados pessoais (`reveal`) | sim | sim | sim | sim | — |
| Adotantes (`adopters`) | exportar (`export`) | sim | sim | — | sim | — |
| LGPD (titular) (`lgpd`) | aprovar (`approve`) | sim | — | — | — | — |
| Doações (`donations`) | ver (`read`) | sim | sim | — | sim | — |
| Doações (`donations`) | criar (`create`) | sim | sim | — | sim | — |
| Doações (`donations`) | editar (`update`) | sim | sim | — | sim | — |
| Doações (`donations`) | exportar (`export`) | sim | sim | — | sim | — |
| Voluntários (`volunteers`) | ver (`read`) | sim | sim | sim | — | sim |
| Voluntários (`volunteers`) | criar (`create`) | sim | sim | — | — | sim |
| Voluntários (`volunteers`) | editar (`update`) | sim | sim | — | — | sim |
| Voluntários (`volunteers`) | excluir (`delete`) | sim | sim | — | — | — |
| Histórias (`stories`) | ver (`read`) | sim | sim | sim | — | sim |
| Histórias (`stories`) | criar (`create`) | sim | sim | sim | — | — |
| Histórias (`stories`) | editar (`update`) | sim | sim | sim | — | — |
| Histórias (`stories`) | excluir (`delete`) | sim | sim | — | — | — |
| Equipe e permissões (`team`) | ver (`read`) | sim | — | — | — | — |
| Equipe e permissões (`team`) | criar (`create`) | sim | — | — | — | — |
| Equipe e permissões (`team`) | editar (`update`) | sim | — | — | — | — |
