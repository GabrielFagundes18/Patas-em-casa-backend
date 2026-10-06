-- Reversão da 010: encerra todas as sessões abertas e invalida links de redefinição pendentes.
-- Depois dela, a API precisa voltar à versão anterior (sem sessões no banco).

DROP TABLE IF EXISTS tokens_redefinicao_acesso;
DROP TABLE IF EXISTS sessoes;
