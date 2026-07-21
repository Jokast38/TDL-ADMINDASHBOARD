from typing import List, Optional
from pydantic import BaseModel


class BlogPostIn(BaseModel):
    title: str
    slug: Optional[str] = None
    excerpt: Optional[str] = ""
    content: str
    category: str = "actualites"
    cover_image: Optional[str] = None
    tags: List[str] = []
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    status: str = "draft"


class BlogPostUpdate(BaseModel):
    title: Optional[str] = None
    slug: Optional[str] = None
    excerpt: Optional[str] = None
    content: Optional[str] = None
    category: Optional[str] = None
    cover_image: Optional[str] = None
    tags: Optional[List[str]] = None
    seo_title: Optional[str] = None
    seo_description: Optional[str] = None
    status: Optional[str] = None


class BlogGenerateIn(BaseModel):
    topic: str
    category: str = "actualites"
    tone: Optional[str] = "professionnel et accessible"
    keywords: Optional[str] = ""


class WordPressBlogImportIn(BaseModel):
    wp_ids: Optional[List[int]] = None
    status: str = "draft"
