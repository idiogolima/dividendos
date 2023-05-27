import locale
import requests
from bs4 import BeautifulSoup
import pandas as pd
import sys
from datetime import datetime

ticker = sys.argv[1]
num_years = int(sys.argv[2])
percent = int(sys.argv[3])

locale.setlocale(locale.LC_ALL, 'pt_BR.UTF-8')

url = f'https://www.dadosdemercado.com.br/bolsa/acoes/{ticker}/dividendos'

response = requests.get(url)
soup = BeautifulSoup(response.content, 'html.parser')

# Substituir todas as vírgulas por pontos em toda a página
page_content = str(soup).replace(',', '.')

df = pd.read_html(page_content)[0]

df['Registro'] = pd.to_datetime(df['Registro'], dayfirst=True)

# Filtrar os últimos X anos
current_year = datetime.now().year
df_last_years = df[df['Registro'].dt.year >= current_year - num_years + 1]
df_previous_year = df[df['Registro'].dt.year == current_year - num_years]
df = pd.concat([df_last_years, df_previous_year])

# Agrupar os proventos por ano e calcular a soma
proventos_por_ano = df.groupby(df['Registro'].dt.year)['Valor'].sum()

print(f'Série histórica de proventos nos últimos {num_years} anos:')
print(proventos_por_ano)

total_proventos = df['Valor'].sum()
num_anos = len(df['Registro'].dt.year.unique())
media_proventos = total_proventos / num_anos

# Multiplicar a média por 100 e dividir por 6
valor_final = (media_proventos * 100) / percent

print(f'\nTotal de proventos nos últimos {num_years} anos: {total_proventos}')
print(f'Média de proventos nos últimos {num_years} anos: {media_proventos}')
print(f'Valor final: {valor_final}')

