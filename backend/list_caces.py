import os
import asyncio
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv
from pathlib import Path

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]


async def main():
    docs = await db.formations.find({"category": "CACES"}, {"_id": 0, "title": 1, "price": 1, "duration_hours": 1, "active": 1}).to_list(50)
    for d in docs:
        print(d)


if __name__ == "__main__":
    asyncio.run(main())
