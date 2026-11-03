import Domain
import Testing

@Suite("ChannelSlug")
struct ChannelSlugTests {
  @Test(
    "accepte minuscules, chiffres et soulignés, de 4 à 25 caractères",
    arguments: ["abcd", "jean_dupont", "user_2", "0123", "a_b_c_d_e_f_g_h_i_j_k_l_m", "user_0123456789ab"]
  )
  func accepted(value: String) throws {
    let slug = try ChannelSlug(value)

    #expect(slug.rawValue == value)
  }

  @Test(
    "refuse ce qui sort de ^[a-z0-9_]{4,25}$",
    arguments: [
      "",
      "abc",
      "a_b_c_d_e_f_g_h_i_j_k_l_m_",
      "Jean",
      "jean-dupont",
      "jean dupont",
      "jéan",
      "jean\n",
      "jean/../admin",
    ]
  )
  func malformed(value: String) {
    #expect(throws: ChannelSlugError.malformed) {
      try ChannelSlug(value)
    }
  }

  @Test("deux slugs de même valeur sont égaux")
  func equality() throws {
    #expect(try ChannelSlug("jean_dupont") == ChannelSlug("jean_dupont"))
  }
}
