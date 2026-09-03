from pydantic import BaseModel


class AttestationIdentityIn(BaseModel):
    adresse: str
    ville: str
    date_naissance: str
    lieu_naissance: str
    numero_permis: str
    date_delivrance_permis: str
    prefecture_delivrance: str


class AttestationSignIn(BaseModel):
    signature_data_url: str
